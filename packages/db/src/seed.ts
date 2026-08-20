import bcrypt from "bcryptjs";
import { loadRootEnv } from "./env.js";

loadRootEnv();

/**
 * 本地开发用的种子数据。
 *
 * **在 NODE_ENV=production 下直接拒绝运行** —— 这个脚本插的是弱口令账号，
 * 一旦在生产库上跑过一次，就等于把一个公开口令的管理员留在了线上，
 * 而且没有任何提示。生产环境建管理员用 bootstrap.ts。
 */
if (process.env.NODE_ENV === "production") {
  console.error("seed 只用于本地开发。生产环境请用 pnpm db:bootstrap 建管理员。");
  process.exit(1);
}

// 必须在环境变量加载之后再引入：client.ts 在模块顶层就按 DATABASE_URL 建好了连接
const { db } = await import("./index.js");
const { admins, users } = await import("./schema.js");

const accounts = [
  {
    username: process.env.SEED_ADMIN_USERNAME ?? "admin",
    password: process.env.SEED_ADMIN_PASSWORD ?? "admin12345",
    displayName: "管理员",
    role: "admin" as const,
  },
  {
    username: process.env.SEED_STAFF_USERNAME ?? "staff",
    password: process.env.SEED_STAFF_PASSWORD ?? "staff12345",
    displayName: "员工",
    role: "staff" as const,
  },
];

for (const account of accounts) {
  const existing = await db.query.admins.findFirst({
    where: (t, { eq }) => eq(t.username, account.username),
  });
  if (existing) {
    console.log(`账号 ${account.username} 已存在，跳过`);
    continue;
  }

  await db.insert(admins).values({
    username: account.username,
    passwordHash: await bcrypt.hash(account.password, 10),
    displayName: account.displayName,
    role: account.role,
  });
  console.log(`已创建 ${account.role}：${account.username} / ${account.password}`);
}

const demoUser = {
  email: "user@example.com",
  username: "demo",
  password: "demo12345",
  name: "示例用户",
};

const existingUser = await db.query.users.findFirst({
  where: (t, { eq }) => eq(t.email, demoUser.email),
});

if (existingUser) {
  console.log(`用户 ${demoUser.email} 已存在，跳过`);
} else {
  await db.insert(users).values({
    email: demoUser.email,
    username: demoUser.username,
    passwordHash: await bcrypt.hash(demoUser.password, 10),
    name: demoUser.name,
  });
  console.log(`已创建用户：${demoUser.email} / ${demoUser.password}`);
}

console.log("\n种子数据完成。后台入口 /admin/login，前台登录 /login。");
