import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { defineConfig } from "drizzle-kit";

// 这里刻意不 import src/env.ts：drizzle-kit 用自己的加载器解析这个配置文件，
// 跨文件的 .js/.ts 扩展名映射不一定成立，自包含最稳妥。
// 同样的原因不能用 import.meta.dirname —— 那个加载器会把配置转成 CJS，该属性为 undefined。
function findRepoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("找不到仓库根目录（未定位到 pnpm-workspace.yaml）");
}

const repoRoot = findRepoRoot();

const envPath = resolve(repoRoot, ".env");
if (existsSync(envPath)) process.loadEnvFile(envPath);

const raw = process.env.DATABASE_URL ?? "file:./data/dev.db";
const url = raw.startsWith("file:")
  ? (() => {
      const p = raw.slice("file:".length);
      return isAbsolute(p) ? raw : `file:${resolve(repoRoot, p)}`;
    })()
  : raw;

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "turso",
  dbCredentials: {
    url,
    authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
  },
});
