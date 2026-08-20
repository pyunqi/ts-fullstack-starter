import { admins, db, images, users } from "@app/db";
import { ARCHIVE_TYPES, type ArchiveItemDto, type ArchiveType } from "@app/shared";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { audit } from "../lib/audit.js";
import { requireAdmin, requireStaff, type AppEnv } from "../middleware/session.js";

/**
 * 归档区。
 *
 * 这套骨架里没有「直接删掉」这回事：各处的删除按钮都只是把行标成已归档，
 * 数据从所有日常列表里消失但还在库里。物理删除只在这里发生，是第二个、
 * 显式的动作，而且只有全权管理员能做 —— 不可逆的事不该由一次手滑完成。
 */
export const adminArchive = new Hono<AppEnv>();

adminArchive.use("*", requireStaff);

const archiveTypeSchema = z.enum(ARCHIVE_TYPES);

/**
 * 类型和表的唯一挂接点。
 *
 * `scripts/check-archive.mjs` 从这张映射表反推「每一类归档打在哪张表上」，
 * 再和 schema 里带 archived_at 的表、ARCHIVE_TYPES 三边对齐。
 * 加一类可归档对象时这里必须同时改，改名字也要同步改那个脚本的解析。
 */
const archivedAtOf = {
  account: admins.archivedAt,
  user: users.archivedAt,
} as const;

/**
 * 归档区界面上真正列得出来的类型。
 *
 * 单独写成一个函数而不是直接用 ARCHIVE_TYPES：受限角色能看到的清单
 * 通常比全集小，这里是那个收窄的落点。守卫会检查每一类都出现在这里 ——
 * 「接上了但界面列不出来」和没接是一样的。
 */
function typesFor(role: string): ArchiveType[] {
  return role === "admin" ? ["account", "user"] : [];
}

/** 归档操作人要单独起别名：admins 表在账号类型的查询里已经作为主表出现 */
const archivedByAdmin = alias(admins, "archived_by_admin");

/**
 * 「这批 id 各自被引用了多少次」，用一条 group by 查完。
 *
 * 刻意不用相关子查询：drizzle 在单表 select 里会把外层列渲染成不带表名的
 * `"id"`，塞进子查询后 SQLite 会解析成子查询自己那张表的 id，结果恒为 0 ——
 * 不报错，只是数字一直是零。这类计数一律走显式的 where in + group by。
 */
async function countUploadsBy(adminIds: string[]): Promise<Map<string, number>> {
  if (adminIds.length === 0) return new Map();

  const rows = await db
    .select({ key: images.uploadedBy, n: sql<number>`count(*)` })
    .from(images)
    .where(inArray(images.uploadedBy, adminIds))
    .groupBy(images.uploadedBy);

  return new Map(rows.map((r) => [String(r.key), Number(r.n)]));
}

/**
 * 已归档的后台账号。
 *
 * 传过图的账号**物理删不掉**（images.uploaded_by 是 restrict 外键），
 * 原因在列表里就标出来，而不是等用户点了删除再报错 ——
 * 「点下去才发现不行」会让人以为是系统坏了。
 */
async function listAccounts(): Promise<ArchiveItemDto[]> {
  const rows = await db
    .select({
      id: admins.id,
      username: admins.username,
      displayName: admins.displayName,
      archivedAt: admins.archivedAt,
      archivedByName: archivedByAdmin.displayName,
    })
    .from(admins)
    .leftJoin(archivedByAdmin, eq(archivedByAdmin.id, admins.archivedBy))
    .where(isNotNull(admins.archivedAt))
    .orderBy(desc(admins.archivedAt));

  const uploads = await countUploadsBy(rows.map((r) => r.id));

  return rows.map((r) => {
    const n = uploads.get(r.id) ?? 0;
    return {
      id: r.id,
      type: "account" as const,
      label: `${r.displayName}（${r.username}）`,
      archivedAt: r.archivedAt!.toISOString(),
      archivedByName: r.archivedByName,
      deleteBlockedReason: n > 0 ? `该账号传过 ${n} 张图片，删除会断掉来源记录` : null,
    };
  });
}

async function listUsers(): Promise<ArchiveItemDto[]> {
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      name: users.name,
      archivedAt: users.archivedAt,
      archivedByName: archivedByAdmin.displayName,
    })
    .from(users)
    .leftJoin(archivedByAdmin, eq(archivedByAdmin.id, users.archivedBy))
    .where(isNotNull(users.archivedAt))
    .orderBy(desc(users.archivedAt));

  return rows.map((r) => ({
    id: r.id,
    type: "user" as const,
    label: `${r.name}（${r.username}）`,
    archivedAt: r.archivedAt!.toISOString(),
    archivedByName: r.archivedByName,
    deleteBlockedReason: null,
  }));
}

adminArchive.get("/", async (c) => {
  const types = typesFor(c.get("adminRole"));
  const items: ArchiveItemDto[] = [];

  if (types.includes("account")) items.push(...(await listAccounts()));
  if (types.includes("user")) items.push(...(await listUsers()));

  items.sort((a, b) => b.archivedAt.localeCompare(a.archivedAt));
  return c.json({ types, items });
});

/** 恢复：清掉归档标记，数据原样回到它原来的列表里 */
adminArchive.post("/:type/:id/restore", requireAdmin, async (c) => {
  const parsed = archiveTypeSchema.safeParse(c.req.param("type"));
  if (!parsed.success) return c.json({ error: "not_found" }, 404);
  const type = parsed.data;
  const id = c.req.param("id");

  const patch = { archivedAt: null, archivedBy: null };
  /**
   * 条件里带上 isNotNull(archivedAt)：没被归档的行不该经由这个接口被「恢复」。
   * 少了这一条，随便一个 id 都会返回 ok，而实际什么都没发生。
   */
  const done =
    type === "account"
      ? await db
          .update(admins)
          .set(patch)
          .where(and(eq(admins.id, id), isNotNull(admins.archivedAt)))
          .returning({ id: admins.id })
      : await db
          .update(users)
          .set(patch)
          .where(and(eq(users.id, id), isNotNull(users.archivedAt)))
          .returning({ id: users.id });

  if (done.length === 0) return c.json({ error: "not_found" }, 404);

  await audit(c, {
    action: "archive.restore",
    targetType: type,
    targetId: id,
    summary: "从归档区恢复",
  });

  return c.json({ ok: true });
});

/**
 * 彻底删除是不可逆的，日志必须留下 —— 事后想弄清「那条数据去哪了」，
 * 这条记录是唯一的线索。
 */
async function auditPurge(
  c: Context<AppEnv>,
  type: ArchiveType,
  id: string,
  summary: string,
): Promise<void> {
  await audit(c, { action: "archive.purge", targetType: type, targetId: id, summary });
}

/**
 * 彻底删除。只有全权管理员能做，而且只对已经在归档区里的数据生效 ——
 * 任何东西都必须先被归档，没有一步到位的删除路径。
 */
adminArchive.delete("/:type/:id", requireAdmin, async (c) => {
  const parsed = archiveTypeSchema.safeParse(c.req.param("type"));
  if (!parsed.success) return c.json({ error: "not_found" }, 404);
  const type = parsed.data;
  const id = c.req.param("id");

  const archived = isNotNull(archivedAtOf[type]);

  if (type === "account") {
    /**
     * 先查引用再删，而不是靠外键抛错。
     *
     * restrict 外键确实会挡住，但它抛出来的是一句 SQLITE_CONSTRAINT，
     * 翻不成人话也说不清是哪条引用挡的。前置检查能直接告诉用户
     * 「这个账号传过 3 张图」，那才是他能据此做决定的信息。
     */
    const uploads = await countUploadsBy([id]);
    const n = uploads.get(id) ?? 0;
    if (n > 0) {
      return c.json({ error: "account_has_uploads", params: { count: n } }, 409);
    }

    const deleted = await db
      .delete(admins)
      .where(and(eq(admins.id, id), archived))
      .returning({ id: admins.id });

    if (deleted.length === 0) return c.json({ error: "not_found" }, 404);
    await auditPurge(c, type, id, "彻底删除后台账号");
    return c.json({ ok: true });
  }

  const deleted = await db
    .delete(users)
    .where(and(eq(users.id, id), archived))
    .returning({ id: users.id });

  if (deleted.length === 0) return c.json({ error: "not_found" }, 404);
  await auditPurge(c, type, id, "彻底删除用户");
  return c.json({ ok: true });
});
