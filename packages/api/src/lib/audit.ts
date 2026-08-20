import { auditLogs, db } from "@app/db";
import type { Context } from "hono";
import type { AppEnv } from "../middleware/session.js";
import { clientIp } from "./rate-limit.js";

/**
 * 审计日志。
 *
 * 只记「改变了什么」的动作：登录、增删改、归档与彻底删除。
 * 不记读取 —— 在这个体量下全量记录读操作只会让日志被列表请求淹没，
 * 真出事的时候反而翻不到关键那几行。
 *
 * 操作人的名字和角色在写入时快照一份，不做外键：
 * 账号后来被彻底删除了，日志仍然要能说清当时是谁干的。
 */
export type AuditAction =
  | "auth.login.success"
  | "auth.login.failed"
  | "auth.login.blocked"
  | "account.create"
  | "account.update"
  | "account.archive"
  | "account.password"
  | "user.register"
  | "user.archive"
  | "image.upload"
  | "image.delete"
  | "settings.update"
  | "archive.restore"
  | "archive.purge";

type AuditInput = {
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  /** 一句人话，直接显示在日志页上 */
  summary?: string;
  /** 未登录场景（登录失败）下手工带上标识 */
  actorName?: string;
};

/**
 * 写一条日志。
 *
 * 刻意吞掉所有异常：日志写不进去是运维问题，不该让用户的正常操作跟着失败。写不进去至少还有 console 上的痕迹。
 */
export async function audit(c: Context<AppEnv>, input: AuditInput): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      action: input.action,
      actorId: c.get("adminId") ?? null,
      actorName: c.get("adminName") ?? input.actorName ?? null,
      actorRole: c.get("adminRole") ?? null,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      summary: input.summary ?? null,
      ip: clientIp(c),
    });
  } catch (err) {
    console.error("[audit] 写审计日志失败（已忽略）:", err);
  }
}
