import { admins, db } from "@app/db";
import { adminLoginSchema, passwordChangeSchema } from "@app/shared";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { notArchived } from "../lib/archive.js";
import { audit } from "../lib/audit.js";
import { ADMIN_COOKIE, clearSession, issueAdminSession } from "../lib/auth.js";
import {
  checkLoginAllowed,
  clearFailedLogins,
  clientIp,
  consumeRate,
  recordFailedLogin,
} from "../lib/rate-limit.js";
import { requireStaff, type AppEnv } from "../middleware/session.js";

export const adminAuth = new Hono<AppEnv>();

adminAuth.post("/login", async (c) => {
  const parsed = adminLoginSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "invalid_input", details: parsed.error.issues }, 400);
  }

  const username = parsed.data.username;
  const ip = clientIp(c);

  /**
   * 限流放在查库之前：被锁定时连密码都不去比对，
   * 既省掉 bcrypt 的开销，也不给「这个用户名存不存在」留下任何时间差。
   */
  const verdict = await checkLoginAllowed(username, ip);
  if (verdict.blocked) {
    await audit(c, {
      action: "auth.login.blocked",
      actorName: username,
      summary: `登录尝试过于频繁，已暂时锁定：${username}`,
    });
    return c.json({ error: "too_many_attempts" }, 429, {
      "Retry-After": String(verdict.retryAfterSeconds),
    });
  }

  const [admin] = await db
    .select()
    .from(admins)
    // 已归档（= 已删除）的账号连「用户名存不存在」都不该暴露，直接当查无此人
    .where(and(eq(admins.username, parsed.data.username), notArchived.account))
    .limit(1);

  // 用户名不存在和密码错误返回同一个错误，避免暴露哪些用户名有效
  const passwordOk = admin
    ? await bcrypt.compare(parsed.data.password, admin.passwordHash)
    : false;

  if (!admin || !passwordOk) {
    await recordFailedLogin(username, ip);
    await audit(c, {
      action: "auth.login.failed",
      actorName: username,
      summary: `后台登录失败：${username}`,
    });
    return c.json({ error: "invalid_credentials" }, 401);
  }

  // 已停用的账号即便密码正确也不发会话
  if (admin.disabledAt) {
    await recordFailedLogin(username, ip);
    await audit(c, {
      action: "auth.login.failed",
      actorName: username,
      summary: `已停用的账号尝试登录：${username}`,
    });
    return c.json({ error: "account_disabled" }, 403);
  }

  await db
    .update(admins)
    .set({ lastLoginAt: new Date() })
    .where(eq(admins.id, admin.id));

  // 登录成功就把失败计数清零，别让人被自己之前的手滑锁在门外
  await clearFailedLogins(username);
  await issueAdminSession(c, admin.id);

  await audit(c, {
    action: "auth.login.success",
    actorName: admin.displayName,
    targetType: "account",
    targetId: admin.id,
    summary: `后台登录：${admin.username}（${admin.role}）`,
  });

  // 前端按 role 决定落地页和显示哪些入口
  return c.json({
    id: admin.id,
    username: admin.username,
    displayName: admin.displayName,
    role: admin.role,
  });
});

/**
 * 改密码限流。旧密码是这个接口的唯一凭据，不限流就成了一个
 * 「已经拿到 cookie，再慢慢猜旧密码」的爆破入口。和前台那套同一组参数。
 */
const PASSWORD_WINDOW_MINUTES = 15;
const MAX_PASSWORD_ATTEMPTS = 10;

/**
 * 改自己的密码。
 *
 * 挂 requireStaff 而不是 requireAdmin：每种角色都要能改自己的密码。
 * 没有这条路径的话，密码泄露时没有任何办法让已签发的 token 失效，
 * 只能等它自然过期。
 */
adminAuth.post("/password", requireStaff, async (c) => {
  const parsed = passwordChangeSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "invalid_input", details: parsed.error.issues }, 400);
  }
  const adminId = c.get("adminId");

  const limit = await consumeRate(
    "admin_password",
    [{ key: adminId, max: MAX_PASSWORD_ATTEMPTS }],
    PASSWORD_WINDOW_MINUTES,
  );
  if (limit.blocked) {
    return c.json(
      { error: "too_many_requests", params: { minutes: Math.ceil(limit.retryAfterSeconds / 60) } },
      429,
    );
  }

  const [admin] = await db
    .select({ passwordHash: admins.passwordHash })
    .from(admins)
    .where(eq(admins.id, adminId))
    .limit(1);

  if (!admin) return c.json({ error: "unauthorized" }, 401);
  if (!(await bcrypt.compare(parsed.data.currentPassword, admin.passwordHash))) {
    return c.json({ error: "invalid_password" }, 403);
  }

  /**
   * 推进 sessions_valid_from，此前签发的 token 全部失效 ——
   * 「我怀疑密码泄露了」正是最需要踢掉其他设备的场景。
   * 然后给当前设备重发一个，否则改完密码的人会被自己踢下线。
   */
  await db
    .update(admins)
    .set({
      passwordHash: await bcrypt.hash(parsed.data.newPassword, 10),
      sessionsValidFrom: new Date(),
    })
    .where(eq(admins.id, adminId));

  await issueAdminSession(c, adminId);

  await audit(c, {
    action: "account.password",
    targetType: "account",
    targetId: adminId,
    summary: "修改了自己的密码，其他设备已退出登录",
  });

  return c.json({ ok: true });
});

adminAuth.post("/logout", (c) => {
  clearSession(c, ADMIN_COOKIE);
  return c.json({ ok: true });
});

/**
 * 前端用它判断当前是否已登录，以及刷新页面后恢复登录态。
 * 用 requireStaff 而不是 requireAdmin：受限角色也要能取回自己的身份，
 * 具体能看什么由前端根据返回的 role 决定。
 */
adminAuth.get("/me", requireStaff, (c) =>
  c.json({
    id: c.get("adminId"),
    displayName: c.get("adminName"),
    role: c.get("adminRole"),
  }),
);
