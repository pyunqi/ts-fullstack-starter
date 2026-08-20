import type { Config } from "@netlify/functions";
import { app, setBlobBackend } from "@app/api";
import { netlifyBlobBackend } from "../blob-store.js";

/**
 * 把平台特有的能力装进 packages/api。
 *
 * 那个包刻意不依赖任何托管平台的 SDK（由 scripts/check-platform.mjs 强制），
 * 所以对象存储的具体实现要在这里装。在模块顶层装一次即可 ——
 * 同一个函数实例的热调用之间会复用。
 */
setBlobBackend(netlifyBlobBackend);

// Functions v2 的签名就是标准的 Request -> Response，
// 所以不需要 hono/netlify 适配器（那个是给 Deno 版 Edge Functions 用的）。
export default (req: Request): Response | Promise<Response> => app.fetch(req);

export const config: Config = { path: "/api/*" };
