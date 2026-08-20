import { db, users } from "@app/db";
import {
  loginSchema,
  passwordChangeSchema,
  profileUpdateSchema,
  registerSchema,
  type UserDto,
} from "@app/shared";
import bcrypt from "bcryptjs";
import { eq, isNull, and, or } from "drizzle-orm";
import { Hono } from "hono";
import { USER_COOKIE, clearSession, issueUserSession } from "../lib/auth.js";
import { audit } from "../lib/audit.js";
import {
  checkLoginAllowed,
  clearFailedLogins,
  clientIp,
  consumeRate,
  recordFailedLogin,
} from "../lib/rate-limit.js";
import { requireUser, type AppEnv } from "../middleware/session.js";

export const auth = new Hono<AppEnv>();

const BCRYPT_ROUNDS = 10;

const toDto = (u: {
  id: string;
  email: string;
  username: string;
  name: string;
  phone: string | null;
  preferredLocale: UserDto["preferredLocale"];
  createdAt: Date;
}): UserDto => ({
  id: u.id,
  email: u.email,
  username: u.username,
  name: u.name,
  phone: u.phone,
  preferredLocale: u.preferredLocale,
  createdAt: u.createdAt.toISOString(),
});

/**
 * 注册限流。同一个出口 IP 一小时能注册几个账号。
 *
 * 额度往宽了定：脚本和真人差着两个数量级，卡在哪儿都拦得住，
 * 而定紧了会误伤共用出口 IP 的真实用户（公司、学校、运营商 CGNAT）。
 */
const REGISTER_WINDOW_MINUTES = 60;
const MAX_REGISTRATIONS_PER_IP = 5;

auth.post("/register", async (c) => {
  const parsed = registerSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "invalid_input", details: parsed.error.issues }, 400);
  }
  const input = parsed.data;

  /**
   * 限流放在字段校验之后、查重之前。
   *
   * 之后：格式填错不该占用额度，否则一个手滑几次的真人会把自己锁住。
   * 之前：查重会告诉调用方「这个邮箱已注册」，那本身就是可以被用来枚举的信息，
   * 不能让它在限流之外无限次触发。
   */
  const limit = await consumeRate(
    "register",
    [{ key: clientIp(c), max: MAX_REGISTRATIONS_PER_IP }],
    REGISTER_WINDOW_MINUTES,
  );

  if (limit.blocked) {
    return c.json(
      { error: "too_many_requests", params: { minutes: Math.ceil(limit.retryAfterSeconds / 60) } },
      429,
    );
  }

  // 两个登录标识都归一化成小写：否则 Zhang 和 zhang 会是两个账号，
  // 而用户不会认为自己输错了大小写
  const email = input.email.trim().toLowerCase();
  const username = input.username.toLowerCase();

  const existing = await db
    .select({ email: users.email, username: users.username })
    .from(users)
    .where(or(eq(users.email, email), eq(users.username, username)))
    .limit(2);

  // 分别报，否则用户不知道是邮箱重了还是用户名重了，只能一个个试
  if (existing.some((u) => u.email === email)) return c.json({ error: "email_taken" }, 409);
  if (existing.some((u) => u.username === username)) {
    return c.json({ error: "username_taken" }, 409);
  }

  const [created] = await db
    .insert(users)
    .values({
      email,
      username,
      passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
      name: input.name,
      phone: input.phone || null,
      preferredLocale: input.preferredLocale,
    })
    .returning();

  if (!created) return c.json({ error: "internal_error" }, 500);

  await issueUserSession(c, created.id);
  await audit(c, {
    action: "user.register",
    targetType: "user",
    targetId: created.id,
    actorName: created.name,
    summary: `注册用户 ${created.username}`,
  });

  return c.json(toDto(created), 201);
});

/** 一个真实的 bcrypt 哈希，只用于账号不存在时消耗等量的比对时间 */
const DUMMY_HASH = "$2b$10$CwTycUXWue0Thq9StjUM0uJ8.eQ5Hs0hHqLKrqZ5Kx3zvJ0Vd8Ryi";

auth.post("/login", async (c) => {
  const parsed = loginSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "invalid_input", details: parsed.error.issues }, 400);
  }

  const identifier = parsed.data.identifier.trim().toLowerCase();
  const ip = clientIp(c);

  const verdict = await checkLoginAllowed(identifier, ip);
  if (verdict.blocked) {
    return c.json({ error: "too_many_attempts" }, 429, {
      "Retry-After": String(verdict.retryAfterSeconds),
    });
  }

  /**
   * 邮箱和用户名都能登录。这里不按有没有 @ 分流去查单个字段，而是一次查两个：
   * 用户名的格式校验已经禁止了 @，所以两个字段的取值空间不重叠，
   * 一个 identifier 最多命中一行，不会有歧义。一次查询也省掉一次往返。
   */
  const [user] = await db
    .select()
    .from(users)
    .where(
      and(
        or(eq(users.email, identifier), eq(users.username, identifier)),
        isNull(users.archivedAt),
      ),
    )
    .limit(1);

  /**
   * 账号不存在时也跑一次 bcrypt 比对。
   * 直接返回会让「账号不存在」比「密码错误」快一个数量级，
   * 攻击者能靠响应时间枚举出哪些邮箱注册过。
   */
  const passwordOk = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);

  // 账号不存在和密码错误返回同一个错误，不暴露哪些标识有效
  if (!user || !passwordOk) {
    await recordFailedLogin(identifier, ip);
    return c.json({ error: "invalid_credentials" }, 401);
  }

  await clearFailedLogins(identifier);
  await issueUserSession(c, user.id);
  return c.json(toDto(user));
});

auth.post("/logout", (c) => {
  clearSession(c, USER_COOKIE);
  return c.json({ ok: true });
});

auth.get("/me", requireUser, async (c) => {
  const [user] = await db.select().from(users).where(eq(users.id, c.get("userId"))).limit(1);

  if (!user) return c.json({ error: "unauthorized" }, 401);
  return c.json(toDto(user));
});

/**
 * 改资料。只改传来的那几个字段。
 *
 * 邮箱和用户名不在这里 —— 它们是登录标识，见 profileUpdateSchema 的说明。
 */
auth.patch("/me", requireUser, async (c) => {
  const parsed = profileUpdateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "invalid_input", details: parsed.error.issues }, 400);
  }
  const input = parsed.data;

  const patch: Partial<typeof users.$inferInsert> = {};
  if (input.name !== undefined) patch.name = input.name;
  // 空串存成 NULL：「有没有留电话」只能有一种判断方式
  if (input.phone !== undefined) patch.phone = input.phone.trim() || null;
  if (input.preferredLocale !== undefined) patch.preferredLocale = input.preferredLocale;

  if (Object.keys(patch).length === 0) {
    // 什么都没传不算错，直接回当前值，省掉前端一次判断
    const [current] = await db.select().from(users).where(eq(users.id, c.get("userId"))).limit(1);
    return current ? c.json(toDto(current)) : c.json({ error: "unauthorized" }, 401);
  }

  const [updated] = await db
    .update(users)
    .set(patch)
    .where(eq(users.id, c.get("userId")))
    .returning();

  if (!updated) return c.json({ error: "unauthorized" }, 401);
  return c.json(toDto(updated));
});

/**
 * 改密码限流。旧密码是这个接口的唯一凭据，不限流就成了一个
 * 「已经拿到 cookie，再慢慢猜旧密码」的爆破入口。
 */
const PASSWORD_WINDOW_MINUTES = 15;
const MAX_PASSWORD_ATTEMPTS = 10;

auth.post("/password", requireUser, async (c) => {
  const parsed = passwordChangeSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "invalid_input", details: parsed.error.issues }, 400);
  }
  const userId = c.get("userId");

  const limit = await consumeRate(
    "password",
    [{ key: userId, max: MAX_PASSWORD_ATTEMPTS }],
    PASSWORD_WINDOW_MINUTES,
  );
  if (limit.blocked) {
    return c.json(
      { error: "too_many_requests", params: { minutes: Math.ceil(limit.retryAfterSeconds / 60) } },
      429,
    );
  }

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return c.json({ error: "unauthorized" }, 401);

  if (!(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) {
    return c.json({ error: "invalid_password" }, 403);
  }

  /**
   * 推进 sessions_valid_from，让此前签发的 token 全部失效 ——
   * 「我怀疑密码泄露了」正是最需要踢掉其他设备的场景。
   * 然后给当前设备重发一个，否则改完密码的人会被自己踢下线。
   */
  const now = new Date();
  await db
    .update(users)
    .set({
      passwordHash: await bcrypt.hash(parsed.data.newPassword, BCRYPT_ROUNDS),
      sessionsValidFrom: now,
    })
    .where(eq(users.id, userId));

  await issueUserSession(c, userId);
  return c.json({ ok: true });
});
