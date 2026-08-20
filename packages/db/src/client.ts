import { resolveDatabaseUrl } from "./env.js";

const rawUrl = process.env.DATABASE_URL ?? "file:./data/dev.db";
const authToken = process.env.DATABASE_AUTH_TOKEN || undefined;

// Netlify Functions 没有持久化磁盘，本地文件数据库进了生产就是静默丢数据。
// 宁可启动即失败，也不要让误配置悄悄生效。
if (process.env.NODE_ENV === "production" && rawUrl.startsWith("file:")) {
  throw new Error(
    "生产环境不能使用本地文件数据库。请把 DATABASE_URL 配成 libsql:// 开头的 Turso 地址。",
  );
}

const url = resolveDatabaseUrl(rawUrl);
const isLocalFile = url.startsWith("file:");

/**
 * 按协议选驱动，这一步对能否部署成功是决定性的：
 *
 * - 本地 file:  用 node 驱动，它依赖 libsql 的平台原生 .node 绑定；
 * - 生产 libsql:// 用 web 驱动，纯 HTTP 实现，不碰任何原生模块。
 *
 * 如果这里无条件走 node 驱动，函数打包时原生绑定不会被带上，
 * 部署后一加载就是 MODULE_NOT_FOUND —— 实测过，务必保留这个分支。
 */
const { createClient } = isLocalFile
  ? await import("@libsql/client/node")
  : await import("@libsql/client/web");

// 模块顶层实例化一次并全局复用：同一 Lambda 容器的热调用之间复用底层 HTTP 连接。
export const client = createClient({ url, authToken });
