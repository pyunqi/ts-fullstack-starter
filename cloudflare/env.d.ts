/**
 * Cloudflare 运行时类型的最小声明。
 *
 * 刻意**不装 `@cloudflare/workers-types`**：
 *
 * 1. 仓库根目录没有 tsconfig.json，`pnpm typecheck` 只走 turbo 进各个
 *    workspace 包，`cloudflare/` 和 `netlify/` 都不在其中 —— 装了也不会
 *    在 CI 里帮我们查出任何东西，只是编辑器里好看一点。
 * 2. 装它要动根 package.json 和 lockfile，而 Netlify 每次构建都会跑
 *    `pnpm install`。为一个还没定下来的平台去拖慢线上构建不划算。
 *
 * 这里只声明实际用到的那几个成员。等哪天真的定了用 Cloudflare，
 * 换成 `pnpm add -Dw @cloudflare/workers-types` 并删掉这个文件即可。
 */

/** R2 对象（带 body）。完整类型见 @cloudflare/workers-types 的 R2ObjectBody */
interface R2ObjectBody {
  arrayBuffer(): Promise<ArrayBuffer>;
  customMetadata?: Record<string, string>;
}

interface R2PutOptions {
  customMetadata?: Record<string, string>;
}

/**
 * R2 存储桶绑定。
 *
 * 注意 `get()` 在真实类型里是 `R2ObjectBody | R2Object | null` ——
 * 只有传了 range/条件读之类的选项才可能拿到没有 body 的 R2Object。
 * 我们从来不传那些选项，所以这里收窄成带 body 的版本。
 */
interface R2Bucket {
  put(
    key: string,
    value: ArrayBuffer | ReadableStream | string | null,
    options?: R2PutOptions,
  ): Promise<unknown>;
  get(key: string): Promise<R2ObjectBody | null>;
  delete(key: string | string[]): Promise<void>;
}

/** Worker 的环境绑定。名字要和 wrangler.jsonc 里的 binding 对上 */
interface CloudflareEnv {
  PUBLIC_IMAGES: R2Bucket;
  PRIVATE_FILES: R2Bucket;
}
