import { admins, users } from "@app/db";
import { isNull } from "drizzle-orm";

/**
 * 「还活着」的过滤条件，每类可归档对象一个。
 *
 * 归档就是这套骨架里的删除：行还在库里，但必须从所有日常查询里消失。
 * 集中放在这里是为了能一眼数清有哪些入口需要它 —— 漏掉任何一处，
 * 已删除的数据就会从那个口子漏回界面上，而且通常要等用户发现才知道。
 *
 * 加一类可归档对象时，这里、ARCHIVE_TYPES、routes/admin-archive.ts
 * 三处必须同时改，`scripts/check-archive.mjs` 会对齐它们。
 */
export const notArchived = {
  account: isNull(admins.archivedAt),
  user: isNull(users.archivedAt),
};
