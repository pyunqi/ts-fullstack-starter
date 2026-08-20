import { admins, db, users } from "@app/db";
import type { AdminRole } from "@app/shared";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { readAdminSession, readUserSession } from "../lib/auth.js";

export type AppEnv = {
  Variables: {
    adminId: string;
    adminName: string;
    adminRole: AdminRole;
    userId: string;
  };
};

/**
 * 从 cookie 解析出后台账号并校验它当前仍然可用。
 *
 * **token 有效不代表账号有效**：账号可能已被停用或归档，
 * 所以每次都回库确认一次，而不是只信 JWT 里的内容。
 * 这一次查询是整套鉴权里最容易被「优化掉」的地方 ——
 * 去掉它，被停用的账号能一直用到 token 自然过期。
 */
async function loadAdmin(c: Context<AppEnv>) {
  const session = await readAdminSession(c);
  const adminId = session?.subject;
  if (!adminId) return null;

  const [admin] = await db
    .select({
      id: admins.id,
      displayName: admins.displayName,
      role: admins.role,
      disabledAt: admins.disabledAt,
      sessionsValidFrom: admins.sessionsValidFrom,
      archivedAt: admins.archivedAt,
    })
    .from(admins)
    .where(eq(admins.id, adminId))
    .limit(1);

  if (!admin || admin.disabledAt || admin.archivedAt) return null;

  /**
   * 改密码之后，此前签发的 token 全部作废。
   *
   * issuedAt 已经是毫秒精度的（verify 里优先取自定义的 iatMs 声明，
   * 因为标准 iat 只到秒，而改密码和重新签发常落在同一秒里）。
   */
  if (session.issuedAt.getTime() < admin.sessionsValidFrom.getTime()) return null;
  return admin;
}

type LoadedAdmin = NonNullable<Awaited<ReturnType<typeof loadAdmin>>>;

function setAdminContext(c: Context<AppEnv>, admin: LoadedAdmin): void {
  c.set("adminId", admin.id);
  c.set("adminName", admin.displayName);
  c.set("adminRole", admin.role);
}

/**
 * 全权管理员专用接口的守卫。只有 admin 拿得到 ——
 * 开账号、改站点设置、物理删除这些事不下放。
 */
export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  const admin = await loadAdmin(c);
  if (!admin) return c.json({ error: "unauthorized" }, 401);
  if (admin.role !== "admin") return c.json({ error: "forbidden" }, 403);

  setAdminContext(c, admin);
  await next();
});

/**
 * 日常操作接口的守卫。两种后台角色都放行 ——
 * 管理员本来就该能干员工能干的事，反过来不行。
 *
 * 放行不等于能看全部：守卫只管「谁能进门」，
 * 「进门后看得到哪些行」是每个查询自己的责任，两件事刻意分开。
 * 需要按归属过滤的项目见 docs/patterns/multi-tenant.md。
 */
export const requireStaff = createMiddleware<AppEnv>(async (c, next) => {
  const admin = await loadAdmin(c);
  if (!admin) return c.json({ error: "unauthorized" }, 401);

  setAdminContext(c, admin);
  await next();
});

/** 必须登录才能用的前台接口的守卫 */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const session = await readUserSession(c);
  if (!session) return c.json({ error: "unauthorized" }, 401);

  const [user] = await db
    .select({
      id: users.id,
      sessionsValidFrom: users.sessionsValidFrom,
      archivedAt: users.archivedAt,
    })
    .from(users)
    .where(eq(users.id, session.subject))
    .limit(1);

  if (!user || user.archivedAt) return c.json({ error: "unauthorized" }, 401);

  if (session.issuedAt.getTime() < user.sessionsValidFrom.getTime()) {
    return c.json({ error: "unauthorized" }, 401);
  }

  c.set("userId", user.id);
  await next();
});
