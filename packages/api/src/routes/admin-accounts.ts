import { admins, db } from "@app/db";
import { adminCreateSchema, adminUpdateSchema, type AdminDto } from "@app/shared";
import bcrypt from "bcryptjs";
import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { notArchived } from "../lib/archive.js";
import { audit } from "../lib/audit.js";
import { requireAdmin, type AppEnv } from "../middleware/session.js";

/**
 * 后台账号管理，只留给全权管理员。
 *
 * 开一个账号等于决定谁能看到用户的个人信息，这个决定权不下放 ——
 * 受限角色要加人手就来找管理员开。
 */
export const adminAccounts = new Hono<AppEnv>();

adminAccounts.use("*", requireAdmin);

const selection = {
  id: admins.id,
  username: admins.username,
  displayName: admins.displayName,
  role: admins.role,
  disabledAt: admins.disabledAt,
  lastLoginAt: admins.lastLoginAt,
  createdAt: admins.createdAt,
};

function toDto(row: {
  id: string;
  username: string;
  displayName: string;
  role: AdminDto["role"];
  disabledAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
}): AdminDto {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    role: row.role,
    disabled: row.disabledAt !== null,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

adminAccounts.get("/", async (c) => {
  const rows = await db
    .select(selection)
    .from(admins)
    // 归档的账号只在归档区里出现
    .where(notArchived.account)
    .orderBy(asc(admins.createdAt));

  return c.json(rows.map(toDto));
});

adminAccounts.post("/", async (c) => {
  const parsed = adminCreateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "invalid_input", details: parsed.error.issues }, 400);
  }
  const input = parsed.data;

  /**
   * 用户名唯一性要**连归档的账号一起查**：数据库上的唯一索引不认归档状态，
   * 只查未归档的会让人以为这个用户名可用，插入时才撞上索引报 500。
   * 两种情况分别报错，否则用户看到「已占用」却在列表里找不到那个账号。
   */
  const [existing] = await db
    .select({ id: admins.id, archivedAt: admins.archivedAt })
    .from(admins)
    .where(eq(admins.username, input.username))
    .limit(1);

  if (existing) {
    return c.json(
      { error: existing.archivedAt ? "username_taken_archived" : "username_taken" },
      409,
    );
  }

  const [created] = await db
    .insert(admins)
    .values({
      username: input.username,
      passwordHash: await bcrypt.hash(input.password, 10),
      displayName: input.displayName,
      role: input.role,
    })
    .returning(selection);

  await audit(c, {
    action: "account.create",
    targetType: "account",
    targetId: created?.id,
    summary: `新建账号 ${input.username}（${input.role}）`,
  });

  return c.json(created ? toDto(created) : null, 201);
});

adminAccounts.patch("/:id", async (c) => {
  const parsed = adminUpdateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "invalid_input", details: parsed.error.issues }, 400);
  }
  const input = parsed.data;
  const id = c.req.param("id");
  const self = id === c.get("adminId");

  /**
   * 不允许把自己停用或降级，否则会当场把自己锁在后台外面。
   *
   * **这两条同时保证了「零管理员」不可达**，不需要再加一道
   * 「最后一个管理员动不得」的锁：操作者必须是还能登录的管理员，
   * 如果目标是最后一个还能登录的管理员，那目标就只能是操作者自己 ——
   * 已经被这里挡住了。两个管理员时，谁都不是「最后一个」。
   *
   * 以后如果加了账号的批量操作，这个推理就不成立了，
   * 那时候要补上真正的「最后一个管理员」检查。
   */
  if (self && input.disabled === true) return c.json({ error: "cannot_disable_self" }, 400);
  if (self && input.role !== undefined && input.role !== "admin") {
    return c.json({ error: "cannot_demote_self" }, 400);
  }

  const patch: Record<string, unknown> = {};
  if (input.displayName !== undefined) patch.displayName = input.displayName;
  if (input.role !== undefined) patch.role = input.role;
  if (input.password !== undefined) {
    patch.passwordHash = await bcrypt.hash(input.password, 10);
    /*
      管理员帮人重置密码时，**同样要踢掉那个人已有的会话**。
      重置密码的场景多半是「他忘了」或者「那个号可能不安全了」，
      两种情况下让旧 token 继续活着都说不过去。
    */
    patch.sessionsValidFrom = new Date();
  }
  if (input.disabled !== undefined) patch.disabledAt = input.disabled ? new Date() : null;

  if (Object.keys(patch).length === 0) return c.json({ error: "invalid_input" }, 400);

  const updated = await db
    .update(admins)
    .set(patch)
    // 归档的账号要先恢复才能改
    .where(and(eq(admins.id, id), notArchived.account))
    .returning(selection);

  const row = updated[0];
  if (!row) return c.json({ error: "not_found" }, 404);

  await audit(c, {
    action: "account.update",
    targetType: "account",
    targetId: id,
    // 密码只记「改过」，不记内容
    summary: `修改账号 ${row.username}：${Object.keys(patch)
      .map((k) => (k === "passwordHash" ? "重置密码" : k))
      .join("、")}`,
  });

  return c.json(toDto(row));
});

/**
 * 「删除」账号 = 移入归档区。归档后立刻登不进来，也不再出现在账号列表里。
 *
 * 注意这和「停用」不是一回事，两者都保留：停用是日常操作（离职、临时禁用），
 * 账号还在列表里随时能恢复；归档是删除，人已经不在这套体系里了。
 */
adminAccounts.delete("/:id", async (c) => {
  const id = c.req.param("id");
  // 把自己归档等于当场把自己锁在门外，和停用自己一样挡掉
  if (id === c.get("adminId")) return c.json({ error: "cannot_disable_self" }, 400);

  const archived = await db
    .update(admins)
    .set({ archivedAt: new Date(), archivedBy: c.get("adminId") })
    .where(and(eq(admins.id, id), notArchived.account))
    .returning({ id: admins.id });

  if (archived.length === 0) return c.json({ error: "not_found" }, 404);

  await audit(c, {
    action: "account.archive",
    targetType: "account",
    targetId: id,
    summary: "账号移入归档区，无法再登录",
  });

  return c.json({ ok: true });
});
