import { admins, client, db, users } from "@app/db";
import bcrypt from "bcryptjs";
import { migrate } from "drizzle-orm/libsql/migrator";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "../src/app.js";

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../db/migrations");

/** 测试里统一用这个密码，bcrypt 轮数也调低 —— 这里测的是权限不是加密强度 */
export const PASSWORD = "test-password-123";

async function account(username: string, role: "admin" | "staff") {
  const [row] = await db
    .insert(admins)
    .values({
      username,
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      displayName: username,
      role,
    })
    .returning({ id: admins.id });
  return row!.id;
}

export type Fixture = Awaited<ReturnType<typeof seed>>;

export async function seed() {
  // 建表：**直接跑真实迁移**，保证测试用的库结构和生产完全一致。
  // 用 drizzle-kit push 或者手写建表语句都会让两边悄悄分叉。
  await migrate(db, { migrationsFolder });

  const accounts = {
    admin: await account("root", "admin"),
    staff: await account("worker", "staff"),
  };

  const [user] = await db
    .insert(users)
    .values({
      email: "user@test.local",
      username: "tester",
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      name: "测试用户",
    })
    .returning({ id: users.id });

  return { accounts, userId: user!.id };
}

export async function closeDb(): Promise<void> {
  client.close();
}

// ---------- 发请求的小工具 ----------

/**
 * `cookie` 是响应里 set-cookie 的第一段（`名=值`），可以直接塞进后续请求。
 *
 * 之所以要暴露它：改密码这类接口会**顺手重发一个会话** ——
 * 要验证「旧 token 失效而新 token 有效」，就必须拿得到这个新的。
 */
export type Res = { status: number; body: any; cookie: string | null };

export async function call(path: string, init?: RequestInit & { cookie?: string }): Promise<Res> {
  const { cookie, ...rest } = init ?? {};
  const given = (rest.headers as Record<string, string>) ?? {};

  /**
   * 只在调用方没给 content-type 时才补 JSON 那个默认值。
   *
   * HTTP 头名是大小写不敏感的，但普通对象的键不是 —— 无条件塞
   * "Content-Type": "application/json"，调用方再给一个小写的 "content-type"，
   * 两个键会同时留在对象里，最后合并成 "application/json, image/png"，
   * 上传接口一律判成不支持的格式。
   */
  const hasContentType = Object.keys(given).some((k) => k.toLowerCase() === "content-type");

  const headers: Record<string, string> = {
    ...(rest.body && !hasContentType ? { "Content-Type": "application/json" } : {}),
    ...(cookie ? { cookie } : {}),
    ...given,
  };

  const res = await app.request(`http://test/api${path}`, { ...rest, headers });
  const text = await res.text();

  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  return { status: res.status, body, cookie: res.headers.get("set-cookie")?.split(";")[0] ?? null };
}

export const post = (path: string, body: unknown, cookie?: string) =>
  call(path, { method: "POST", body: JSON.stringify(body), cookie });

export const patch = (path: string, body: unknown, cookie?: string) =>
  call(path, { method: "PATCH", body: JSON.stringify(body), cookie });

export const del = (path: string, cookie?: string) => call(path, { method: "DELETE", cookie });

/** 后台登录，返回可直接塞进后续请求的 cookie 串 */
export async function login(username: string, password = PASSWORD): Promise<string> {
  const res = await post("/admin/auth/login", { username, password });
  if (!res.cookie) throw new Error(`登录失败：${JSON.stringify(res.body)}`);
  return res.cookie;
}

/** 前台登录 */
export async function loginUser(identifier: string, password = PASSWORD): Promise<string> {
  const res = await post("/auth/login", { identifier, password });
  if (!res.cookie) throw new Error(`登录失败：${JSON.stringify(res.body)}`);
  return res.cookie;
}
