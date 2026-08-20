import { app, setBlobBackend } from "@app/api";
import { r2BlobBackend } from "./r2-store.js";

/**
 * Cloudflare Workers 入口，对应 netlify/functions/api.mts。
 *
 * ## 和 Netlify 入口的唯一结构差异：装配的时机
 *
 * Netlify 那边 `getStore()` 是环境自带的，模块顶层就能调，所以
 * `setBlobBackend()` 写在模块顶层，整个函数实例只跑一次。
 *
 * Workers 不行 —— R2 绑定挂在 `fetch(request, env, ctx)` 的 `env` 上，
 * **模块顶层根本拿不到**。所以装配只能推迟到第一个请求进来时。
 *
 * 用一个标志位挡住重复装配是安全的：`env` 在同一个 isolate 的生命周期里
 * 是同一个对象，装一次之后后续请求拿到的绑定完全相同。就算两个请求并发
 * 同时进到这里，赋的也是等价的实现，没有竞态可言。
 *
 * ## 为什么 packages/db 不用改
 *
 * `packages/db/src/client.ts` 在**模块顶层**读 `process.env.DATABASE_URL`
 * 并建连接。这在 Workers 上一度是我最担心的地方 —— 但实测确认：
 * 开了 `nodejs_compat` 之后，`vars` 和 secrets 在模块顶层就已经注入到
 * `process.env` 里了。所以 client.ts、auth.ts、email.ts 那几处读环境变量的
 * 代码一行都不用动。
 *
 * ## 路由分工
 *
 * wrangler.jsonc 里配了 `run_worker_first: ["/api/*"]`，
 * 所以只有 `/api/*` 会走到这个 Worker，其余路径由静态资源直接返回、
 * 匹配不到的再兜底到 index.html。分工和 netlify.toml 完全一致。
 */

let wired = false;

export default {
  fetch(request: Request, env: CloudflareEnv): Response | Promise<Response> {
    if (!wired) {
      setBlobBackend(r2BlobBackend(env));
      wired = true;
    }

    return app.fetch(request);
  },
};
