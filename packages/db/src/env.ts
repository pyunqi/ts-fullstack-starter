import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 仓库根目录：从本文件向上找到含 pnpm-workspace.yaml 的目录。
 * 只在本地（file: 数据库）路径解析和脚本加载 .env 时使用；
 * 生产环境走 libsql:// 远程连接，不会调用到这里。
 */
export function findRepoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("找不到仓库根目录（未定位到 pnpm-workspace.yaml）");
}

/**
 * 供 drizzle-kit、seed 等独立脚本使用。
 * netlify dev 会自行注入环境变量，无需调用本函数。
 */
export function loadRootEnv(): void {
  const envPath = resolve(findRepoRoot(), ".env");
  if (existsSync(envPath)) process.loadEnvFile(envPath);
}

/**
 * 把 file: 形式的相对路径统一解析到仓库根，
 * 这样无论从仓库根还是从 packages/db 运行，指向的都是同一个 .db 文件。
 */
export function resolveDatabaseUrl(rawUrl: string): string {
  if (!rawUrl.startsWith("file:")) return rawUrl;
  const filePath = rawUrl.slice("file:".length);
  if (isAbsolute(filePath)) return rawUrl;
  return `file:${resolve(findRepoRoot(), filePath)}`;
}
