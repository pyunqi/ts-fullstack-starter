import { auditLogs, db } from "@app/db";
import { paginationSchema, type AuditLogDto, type Paginated } from "@app/shared";
import { and, desc, eq, like, sql, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { requireAdmin, type AppEnv } from "../middleware/session.js";

/**
 * 审计日志的查看入口，只给全权管理员。
 *
 * 受限角色看不到这里：日志记的是谁在什么时候动了什么，
 * 切一份出来给受限角色看，价值不大、漏字段的风险不小。
 */
export const adminAudit = new Hono<AppEnv>();

adminAudit.use("*", requireAdmin);

adminAudit.get("/", async (c) => {
  const page = paginationSchema.safeParse(c.req.query());
  if (!page.success) {
    return c.json({ error: "invalid_query", details: page.error.issues }, 400);
  }
  const { limit, offset } = page.data;

  const filters: SQL[] = [];

  /**
   * 按前缀筛：传 account 就把 account.create / account.archive 等一并带出。
   * 前缀就是对象类型，这个约定在 lib/audit.ts 的 AuditAction 里定死。
   */
  const action = c.req.query("action")?.trim();
  if (action) filters.push(like(auditLogs.action, `${action}%`));

  const actorId = c.req.query("actorId")?.trim();
  if (actorId) filters.push(eq(auditLogs.actorId, actorId));

  const where = filters.length > 0 ? and(...filters) : undefined;

  const [rows, totalRow] = await Promise.all([
    db
      .select()
      .from(auditLogs)
      .where(where)
      .orderBy(desc(auditLogs.at))
      .limit(limit)
      .offset(offset),
    db.select({ n: sql<number>`count(*)` }).from(auditLogs).where(where),
  ]);

  const body: Paginated<AuditLogDto> = {
    items: rows.map((r) => ({
      id: r.id,
      at: r.at.toISOString(),
      action: r.action,
      actorName: r.actorName,
      actorRole: r.actorRole,
      targetType: r.targetType,
      targetId: r.targetId,
      summary: r.summary,
      ip: r.ip,
    })),
    total: Number(totalRow[0]?.n ?? 0),
    limit,
    offset,
  };

  return c.json(body);
});
