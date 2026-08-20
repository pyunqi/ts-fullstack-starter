import type { AdminRole, ArchiveType, Locale } from "./schemas.js";

export type { AdminRole, ArchiveType, Locale };

/**
 * 分页结果的统一形状。
 *
 * 带上 total 而不是只给一个 hasMore：后台需要显示「共 N 条」，
 * 而那个数字是运营判断规模的依据，翻页猜不出来。
 */
export type Paginated<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
};

/**
 * 服务端返回的错误。
 *
 * - error：机器可读的错误码，前端据此选文案（见 apps/web 的 `error.code.*`）
 * - message：服务端给的原文，只在前端没有对应文案时兜底用
 * - details：字段级信息，校验失败时就是 zod 的 issues 数组
 * - params：文案里要填的数字，比如「最多还能传 3 张」里的 3。
 *   有 params 的错误码，文案在前端按语言拼，**服务端不负责组织人话** ——
 *   服务端拼了中文，英文界面上就会冒出一句中文。
 */
export type ApiError = {
  error: string;
  message?: string;
  details?: unknown;
  params?: Record<string, string | number>;
};

/** 后台账号 */
export type AdminDto = {
  id: string;
  username: string;
  displayName: string;
  role: AdminRole;
  disabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
};

/** 当前登录的后台账号，登录接口和 /admin/auth/me 都返回它 */
export type AdminSessionDto = {
  id: string;
  username: string;
  displayName: string;
  role: AdminRole;
};

/** 前台用户 */
export type UserDto = {
  id: string;
  email: string;
  username: string;
  name: string;
  phone: string | null;
  preferredLocale: Locale;
  createdAt: string;
};

export type AuditLogDto = {
  id: string;
  at: string;
  action: string;
  actorName: string | null;
  actorRole: string | null;
  targetType: string | null;
  targetId: string | null;
  summary: string | null;
  ip: string | null;
};

/**
 * 归档区里的一行。
 *
 * 各类对象共用同一个形状：归档区只需要「这是什么、叫什么、什么时候被谁删的、
 * 能不能物理删除」，不需要各自的完整字段。
 */
export type ArchiveItemDto = {
  id: string;
  type: ArchiveType;
  label: string;
  archivedAt: string;
  archivedByName: string | null;
  /**
   * 不能物理删除时给出原因，直接显示在界面上。
   *
   * 刻意在列表里就标出来，而不是等用户点了删除再报错 ——
   * 「点下去才发现不行」会让人以为是系统坏了。
   */
  deleteBlockedReason: string | null;
};

export type ImageDto = {
  id: string;
  url: string;
  contentType: string;
  byteSize: number;
  createdAt: string;
};
