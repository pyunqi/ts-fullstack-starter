import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { SignJWT, jwtVerify } from "jose";

/** 管理员与普通用户是两套完全独立的身份，用不同的 cookie 和不同的 audience 隔离 */
export const ADMIN_COOKIE = "app_admin";
export const USER_COOKIE = "app_user";

const ADMIN_AUDIENCE = "app:admin";
const USER_AUDIENCE = "app:user";
const ISSUER = "app";
const SESSION_SECONDS = 60 * 60 * 24 * 7; // 7 天

export type Audience = typeof ADMIN_AUDIENCE | typeof USER_AUDIENCE;

function secret(): Uint8Array {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error("缺少 JWT_SECRET 环境变量");
  if (process.env.NODE_ENV === "production" && value === "dev-only-change-me") {
    throw new Error("生产环境仍在使用示例 JWT_SECRET，请更换为强随机值");
  }
  return new TextEncoder().encode(value);
}

/**
 * 毫秒级签发时间，自定义声明。
 *
 * JWT 标准的 iat 只到秒，而「改密码」和「给当前设备重发会话」必然发生在
 * 同一秒里 —— 秒级精度下这两件事分不开，会导致要么谁都踢不掉，
 * 要么把刚改完密码的人自己也踢下线。两边都是自己的代码，没必要迁就秒。
 */
const ISSUED_MS_CLAIM = "iatMs";

async function sign(subject: string, audience: Audience): Promise<string> {
  return new SignJWT({ [ISSUED_MS_CLAIM]: Date.now() })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(subject)
    .setIssuer(ISSUER)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_SECONDS}s`)
    .sign(secret());
}

/** 签发时间。改密码后要靠它判断一个 token 是不是「改之前发的」 */
export type Session = { subject: string; issuedAt: Date };

async function verify(token: string, audience: Audience): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), {
      issuer: ISSUER,
      audience,
    });

    /**
     * 老 token 没有 iatMs（这个声明是后加的），退回标准的 iat。
     *
     * 不退回的话，这次部署会把所有已登录的人一次性踢下线。
     * 精度降回秒对它们无害：sessions_valid_from 默认是 0，
     * 也就是「从未失效过」，怎么比都通得过。
     */
    const issuedMs = payload[ISSUED_MS_CLAIM];
    const issuedAt =
      typeof issuedMs === "number"
        ? new Date(issuedMs)
        : payload.iat !== undefined
          ? new Date(payload.iat * 1000)
          : null;

    if (!payload.sub || !issuedAt) return null;

    return { subject: payload.sub, issuedAt };
  } catch {
    return null;
  }
}

/**
 * 本地 netlify dev 走 http://localhost，带 Secure 的 cookie 会被浏览器拒收，
 * 所以 Secure 只在生产开启。
 */
function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax" as const,
    path: "/",
    maxAge: SESSION_SECONDS,
  };
}

export async function issueAdminSession(c: Context, adminId: string): Promise<void> {
  setCookie(c, ADMIN_COOKIE, await sign(adminId, ADMIN_AUDIENCE), cookieOptions());
}

export async function issueUserSession(c: Context, userId: string): Promise<void> {
  setCookie(c, USER_COOKIE, await sign(userId, USER_AUDIENCE), cookieOptions());
}

export function clearSession(c: Context, cookieName: string): void {
  deleteCookie(c, cookieName, { path: "/" });
}

export async function readAdminId(c: Context): Promise<string | null> {
  return (await readAdminSession(c))?.subject ?? null;
}

/**
 * 连签发时间一起读出来。守卫要用它和 admins.sessions_valid_from 比对 ——
 * 和前台用户那套同一做法，JWT 本身没法吊销。
 */
export async function readAdminSession(c: Context): Promise<Session | null> {
  const token = getCookie(c, ADMIN_COOKIE);
  return token ? verify(token, ADMIN_AUDIENCE) : null;
}

export async function readUserId(c: Context): Promise<string | null> {
  return (await readUserSession(c))?.subject ?? null;
}

/**
 * 连签发时间一起读出来。守卫要用它和 users.sessions_valid_from 比对，
 * 这是改密码之后踢掉其他设备的唯一手段（JWT 本身无法吊销）。
 */
export async function readUserSession(c: Context): Promise<Session | null> {
  const token = getCookie(c, USER_COOKIE);
  return token ? verify(token, USER_AUDIENCE) : null;
}
