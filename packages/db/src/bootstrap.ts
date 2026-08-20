import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { loadRootEnv } from "./env.js";

loadRootEnv();

// 必须在环境变量加载之后再引入：client.ts 在模块顶层就按 DATABASE_URL 建好了连接
const { db } = await import("./index.js");
const { admins } = await import("./schema.js");

/**
 * 建第一个全权管理员。
 *
 * 和 seed.ts 是两回事，别把它们搞混：
 *
 * - `seed` 是本地开发用的，会灌一批弱口令账号和示例数据，
 *   而且在 NODE_ENV=production 时直接拒绝运行
 * - `bootstrap` 是**生产环境唯一的入口**，只做一件事：建一个管理员。
 *   不插任何示例数据
 *
 * 之所以必须有它：全新部署完成后 admins 表是空的，没有这一步谁都登不进后台，
 * 而后台又是开其余账号的唯一地方。
 *
 * 用法（环境变量指向生产库）：
 *
 *   DATABASE_URL=libsql://... DATABASE_AUTH_TOKEN=... \
 *   BOOTSTRAP_ADMIN_USERNAME=... BOOTSTRAP_ADMIN_PASSWORD='...' \
 *   pnpm db:bootstrap
 */

const username = process.env.BOOTSTRAP_ADMIN_USERNAME?.trim();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

/**
 * 刻意没有默认值。
 *
 * 「没配就用 admin/admin12345」这种便利正是弱口令的来源 ——
 * 一个能看到全部用户个人信息的账号，不该因为少配一个环境变量就悄悄降级成公开口令。
 * 少配了就报错，让人回去补上。
 */
if (!username || !password) {
  console.error(
    "缺少环境变量。用法：\n" +
      "  BOOTSTRAP_ADMIN_USERNAME=<用户名> BOOTSTRAP_ADMIN_PASSWORD=<密码> pnpm db:bootstrap\n\n" +
      "刻意不提供默认账号密码 —— 这个账号能看到全部用户的个人信息。",
  );
  process.exit(1);
}

const MIN_PASSWORD_LENGTH = 12;

/** seed.ts 和文档里出现过的演示口令，挡掉「照着示例填」这种最常见的失误 */
const DEMO_PASSWORDS = new Set(["admin12345", "staff12345", "dev-only-change-me"]);

/**
 * 演示口令的检查放在长度检查**之前**。
 *
 * 否则最常见的那种失误（照着 seed 的输出粘 admin12345）会撞上长度检查，
 * 得到一句「密码至少 12 位」—— 于是人就去补两位变成 admin1234567，
 * 而那依然是个人人都猜得到的口令。先说真正的原因。
 */
if (DEMO_PASSWORDS.has(password)) {
  console.error("这是文档和示例数据里的演示口令，不能用于真实账号。请换一个。");
  process.exit(1);
}

if (password.length < MIN_PASSWORD_LENGTH) {
  console.error(`密码至少 ${MIN_PASSWORD_LENGTH} 位，当前只有 ${password.length} 位。`);
  process.exit(1);
}

const [existing] = await db
  .select({ id: admins.id, role: admins.role })
  .from(admins)
  .where(eq(admins.username, username))
  .limit(1);

/**
 * 已存在就原样退出，**绝不改密码**。
 *
 * 这个脚本大概率会被重复执行（换台机器、忘了跑没跑过、写进部署笔记里照着抄一遍）。
 * 如果它顺手把密码重置了，那就成了一条「知道用户名就能覆盖线上管理员」的路径，
 * 而且悄无声息。改密码请登录后台自己改。
 */
if (existing) {
  console.log(`账号 ${username} 已存在（角色：${existing.role}），未做任何修改。`);
  console.log("要改密码请登录后台操作，这个脚本不会覆盖已有账号。");
  process.exit(0);
}

const [created] = await db
  .insert(admins)
  .values({
    username,
    passwordHash: await bcrypt.hash(password, 10),
    displayName: username,
    role: "admin",
  })
  .returning({ id: admins.id });

if (!created) {
  console.error("创建失败。");
  process.exit(1);
}

console.log(`已创建管理员：${username}`);
console.log("现在可以用它登录 /admin/login，然后在后台开其余账号。");
