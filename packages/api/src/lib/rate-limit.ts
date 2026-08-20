import { db, loginAttempts, rateEvents } from "@app/db";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import type { Context } from "hono";

/**
 * 登录限流。
 *
 * 计数存库而不是放进程内存：函数是无状态的，冷启动一次内存计数就清零，
 * 攻击方只要制造并发触发新实例就能绕过去 —— 那种限流看着有，实际没有。
 *
 * 两条独立的线：
 * - 单个账号：防的是盯着某个已知用户名慢慢试密码
 * - 单个 IP：防的是拿一批用户名横着扫（撞库），这时每个账号的失败次数都不高
 */
const WINDOW_MINUTES = 15;
const MAX_PER_IDENTIFIER = 8;
const MAX_PER_IP = 30;

/**
 * 取访问者 IP。
 *
 * Netlify 会带 x-nf-client-connection-ip；退回到 x-forwarded-for 时只取第一段，
 * 后面那些是链路上的代理，可以被请求方伪造，用来计数没有意义。
 */
export function clientIp(c: Context): string | null {
  const direct = c.req.header("x-nf-client-connection-ip");
  if (direct) return direct;

  const forwarded = c.req.header("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || null;
}

function windowStart(): Date {
  return new Date(Date.now() - WINDOW_MINUTES * 60 * 1000);
}

async function countSince(column: AnySQLiteColumn, value: string) {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(loginAttempts)
    .where(and(eq(column, value), gte(loginAttempts.at, windowStart())));

  return Number(row?.n ?? 0);
}

export type RateLimitVerdict = { blocked: true; retryAfterSeconds: number } | { blocked: false };

/** 登录之前问一句：这个标识/这个 IP 现在还能不能试 */
export async function checkLoginAllowed(
  identifier: string,
  ip: string | null,
): Promise<RateLimitVerdict> {
  const key = identifier.trim().toLowerCase();

  const [byIdentifier, byIp] = await Promise.all([
    countSince(loginAttempts.identifier, key),
    ip ? countSince(loginAttempts.ip, ip) : Promise.resolve(0),
  ]);

  if (byIdentifier >= MAX_PER_IDENTIFIER || byIp >= MAX_PER_IP) {
    return { blocked: true, retryAfterSeconds: WINDOW_MINUTES * 60 };
  }
  return { blocked: false };
}

/**
 * 记一次失败。
 *
 * 顺手清掉窗口之外的旧记录：这张表只服务于「最近 15 分钟」，
 * 留着历史既没用又会让计数越来越慢。清理放在写入路径上，
 * 不需要额外的定时任务 —— 无服务器环境里没有地方跑常驻的清理进程。
 */
export async function recordFailedLogin(identifier: string, ip: string | null): Promise<void> {
  await db.insert(loginAttempts).values({ identifier: identifier.trim().toLowerCase(), ip });
  await db.delete(loginAttempts).where(lt(loginAttempts.at, windowStart()));
}

/** 登录成功就把这个标识的失败记录清零，别让人被自己之前的手滑锁在门外 */
export async function clearFailedLogins(identifier: string): Promise<void> {
  await db.delete(loginAttempts).where(eq(loginAttempts.identifier, identifier.trim().toLowerCase()));
}

// ---------- 通用限流：登录之外的匿名写接口 ----------

/**
 * 一条限流规则：这个 key 在窗口内最多允许多少次。
 * key 为 null 表示这条线拿不到依据（比如取不到 IP），直接跳过而不是当成同一个 key ——
 * 否则所有取不到 IP 的请求会共用一个计数器，互相把对方锁死。
 */
export type RateRule = { key: string | null; max: number };

/**
 * 查一次并记一次，两件事合成一个函数。
 *
 * 刻意不拆成 check + record 两个导出：分开的话，调用方在某条提前返回的分支上
 * 忘了 record，限流就会静默失效 —— 而且失效时没有任何症状，
 * 直到被人刷了才发现。合成一个就没有「忘了记」这种用法。
 *
 * 被拦下时**不记**这一次：记了的话，一直重试的人会不断把自己的窗口往后推，
 * 正常用户误触限流后就再也出不来了。窗口自己滑过去就恢复。
 */
export async function consumeRate(
  bucket: string,
  rules: RateRule[],
  windowMinutes: number,
): Promise<RateLimitVerdict> {
  const since = new Date(Date.now() - windowMinutes * 60 * 1000);
  const active = rules.filter((r): r is { key: string; max: number } => Boolean(r.key));

  const counts = await Promise.all(
    active.map(async (rule) => {
      const [row] = await db
        .select({ n: sql<number>`count(*)` })
        .from(rateEvents)
        .where(
          and(eq(rateEvents.bucket, bucket), eq(rateEvents.key, rule.key), gte(rateEvents.at, since)),
        );
      return Number(row?.n ?? 0);
    }),
  );

  if (counts.some((n, i) => n >= active[i]!.max)) {
    return { blocked: true, retryAfterSeconds: windowMinutes * 60 };
  }

  if (active.length > 0) {
    await db.insert(rateEvents).values(active.map((r) => ({ bucket, key: r.key })));
    // 顺手清掉窗口之外的旧行，无服务器环境没有地方跑常驻的清理任务
    await db.delete(rateEvents).where(lt(rateEvents.at, since));
  }

  return { blocked: false };
}
