import { db, users } from "@app/db";
import { count } from "drizzle-orm";
import { Hono } from "hono";

export const health = new Hono();

/**
 * 存在的意义是验证「函数能真正读到数据库」这条链路，
 * 而不只是函数本身能被调用 —— 后者不需要数据库也会返回 200。
 *
 * 首次部署排查打包问题时这个接口最有用：如果它返回的是我们自己写的
 * 那句护栏（见 packages/db/src/client.ts），说明函数加载成功、依赖解析正确；
 * 如果是 MODULE_NOT_FOUND，那就是打包坏了。
 */
health.get("/", async (c) => {
  const started = Date.now();
  const [row] = await db.select({ value: count() }).from(users);
  return c.json({
    ok: true,
    userCount: row?.value ?? 0,
    dbLatencyMs: Date.now() - started,
    runtime: `node ${process.version}`,
  });
});
