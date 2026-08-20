import type {
  AdminDto,
  AdminSessionDto,
  ApiError,
  ArchiveItemDto,
  ArchiveType,
  AuditLogDto,
  Paginated,
  SiteSettings,
  SiteSettingsUpdate,
  UserDto,
} from "@app/shared";

/**
 * 一次失败的请求。
 *
 * 刻意不在这里把错误翻成人话：文案要跟着界面语言走，而这个文件不该碰 i18n。
 * 它只负责如实带出「服务端说了什么」，翻译交给 lib/errors.ts 的 describeError。
 * Error.message 是给控制台和日志看的，界面上不要直接显示它。
 */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    /** 服务端给的原文，前端没有对应文案时才用得上 */
    readonly serverMessage?: string,
    /** 字段级信息，校验失败时是 zod 的 issues 数组 */
    readonly details?: unknown,
    /** 文案里要填的数字，如「最多还能传 3 张」 */
    readonly params?: Record<string, string | number>,
  ) {
    super(`${code} (HTTP ${status})${serverMessage ? `: ${serverMessage}` : ""}`);
    this.name = "ApiRequestError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    // 身份走 httpOnly cookie，必须带上凭证
    credentials: "same-origin",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null;
    throw new ApiRequestError(
      res.status,
      body?.error ?? "unknown_error",
      body?.message,
      body?.details,
      body?.params,
    );
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const json = (body: unknown) => ({ body: JSON.stringify(body) });

// ---------- 前台 ----------

export const api = {
  health: () => request<{ ok: boolean; dbLatencyMs: number }>("/health"),

  settings: () => request<SiteSettings>("/settings"),

  register: (input: {
    email: string;
    username: string;
    password: string;
    name: string;
    phone?: string;
  }) => request<UserDto>("/auth/register", { method: "POST", ...json(input) }),

  login: (input: { identifier: string; password: string }) =>
    request<UserDto>("/auth/login", { method: "POST", ...json(input) }),

  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),

  me: () => request<UserDto>("/auth/me"),

  updateProfile: (input: { name?: string; phone?: string; preferredLocale?: "zh" | "en" }) =>
    request<UserDto>("/auth/me", { method: "PATCH", ...json(input) }),

  changePassword: (input: { currentPassword: string; newPassword: string }) =>
    request<{ ok: true }>("/auth/password", { method: "POST", ...json(input) }),
};

// ---------- 后台 ----------

export const adminApi = {
  login: (input: { username: string; password: string }) =>
    request<AdminSessionDto>("/admin/auth/login", { method: "POST", ...json(input) }),

  logout: () => request<{ ok: true }>("/admin/auth/logout", { method: "POST" }),

  me: () => request<AdminSessionDto>("/admin/auth/me"),

  changePassword: (input: { currentPassword: string; newPassword: string }) =>
    request<{ ok: true }>("/admin/auth/password", { method: "POST", ...json(input) }),

  accounts: () => request<AdminDto[]>("/admin/accounts"),

  createAccount: (input: {
    username: string;
    password: string;
    displayName: string;
    role: "admin" | "staff";
  }) => request<AdminDto>("/admin/accounts", { method: "POST", ...json(input) }),

  updateAccount: (
    id: string,
    input: { displayName?: string; password?: string; role?: "admin" | "staff"; disabled?: boolean },
  ) => request<AdminDto>(`/admin/accounts/${id}`, { method: "PATCH", ...json(input) }),

  archiveAccount: (id: string) =>
    request<{ ok: true }>(`/admin/accounts/${id}`, { method: "DELETE" }),

  settings: () => request<SiteSettings>("/admin/settings"),

  updateSettings: (input: SiteSettingsUpdate) =>
    request<SiteSettings>("/admin/settings", { method: "PATCH", ...json(input) }),

  testEmail: (to: string) =>
    request<{ ok: true; status: string }>("/admin/settings/test-email", {
      method: "POST",
      ...json({ to }),
    }),

  archive: () =>
    request<{ types: ArchiveType[]; items: ArchiveItemDto[] }>("/admin/archive"),

  restore: (type: ArchiveType, id: string) =>
    request<{ ok: true }>(`/admin/archive/${type}/${id}/restore`, { method: "POST" }),

  purge: (type: ArchiveType, id: string) =>
    request<{ ok: true }>(`/admin/archive/${type}/${id}`, { method: "DELETE" }),

  audit: (params: { limit?: number; offset?: number; action?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.limit !== undefined) query.set("limit", String(params.limit));
    if (params.offset !== undefined) query.set("offset", String(params.offset));
    if (params.action) query.set("action", params.action);
    const qs = query.toString();
    return request<Paginated<AuditLogDto>>(`/admin/audit${qs ? `?${qs}` : ""}`);
  },

  /**
   * 上传图片。**body 是裸的二进制**，不是 FormData ——
   * 服务端按 Content-Type 判断格式、按 arrayBuffer 读内容，
   * 多包一层 multipart 只是白白增加体积和解析代码。
   */
  uploadImage: async (blob: Blob) => {
    const res = await fetch("/api/admin/images", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": blob.type },
      body: blob,
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as ApiError | null;
      throw new ApiRequestError(res.status, body?.error ?? "unknown_error", body?.message);
    }

    return (await res.json()) as {
      id: string;
      key: string;
      url: string;
      contentType: string;
      sizeBytes: number;
    };
  },
};
