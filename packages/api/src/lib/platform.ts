/**
 * 平台能力的装配点。
 *
 * `packages/api` 不依赖任何一家托管平台的 SDK —— 这条约束由
 * `scripts/check-platform.mjs` 在构建期强制。需要平台特有能力的地方
 * （目前只有对象存储）都从这里取，具体实现由入口在启动时装进来：
 *
 * - Netlify：`netlify/functions/api.mts` 装 `@netlify/blobs`
 * - Cloudflare：`cloudflare/worker.ts` 装 R2
 * - 测试：`setBlobBackend` 不调用，自动退回内存实现
 *
 * 为什么是模块级注入而不是把实现顺着调用链传下去：
 * `imageStore()` / `sheetStore()` 有六个路由调用点，另外
 * `deleteImageBlobs` / `deleteSheetBlobs` 这两个 lib 内部的 helper
 * 根本拿不到请求上下文。传参要改十几处签名，而这些实现在同一个进程
 * （或 Worker isolate）里本来就是稳定的，装一次就够。
 */

/**
 * 对象存储的最小接口。
 *
 * 这套代码实际只用到这四个方法，收窄成一个接口是为了让不同后端能顶替进来 ——
 * 直接用某一家的完整 Store 类型的话，其余实现得把一堆没用过的方法也实现一遍。
 */
export type BlobStore = {
  set(
    key: string,
    data: ArrayBuffer,
    options?: { metadata?: Record<string, unknown> },
  ): Promise<unknown>;
  get(key: string, options?: { type: "arrayBuffer" }): Promise<ArrayBuffer | null>;
  getWithMetadata(
    key: string,
    options?: { type: "arrayBuffer" },
  ): Promise<{ data: ArrayBuffer; metadata?: Record<string, unknown> } | null>;
  delete(key: string): Promise<unknown>;
};

/** 按用途取 store。两个用途的隔离级别不同，见 images.ts 的说明 */
export type BlobBucket = "images" | "private";

export type BlobBackend = (bucket: BlobBucket) => BlobStore;

let backend: BlobBackend | null = null;

/** 由平台入口在启动时调用一次 */
export function setBlobBackend(next: BlobBackend): void {
  backend = next;
}

/**
 * 测试环境用的内存实现。
 *
 * 单元测试脱离任何托管平台运行，没有真实的对象存储可用。
 * **只在 NODE_ENV === "test" 时启用** —— 生产环境要是悄悄退回内存，
 * 图片会在实例回收时全部消失，而且不报任何错，排查起来是噩梦。
 */
const memoryBlobs = new Map<string, { data: ArrayBuffer; metadata?: Record<string, unknown> }>();

function memoryStore(bucket: BlobBucket): BlobStore {
  // 两个用途共用一张表，用前缀隔开，免得测试里两边的 key 撞上
  const k = (key: string) => `${bucket}:${key}`;
  return {
    set: async (key, data, opts) => {
      memoryBlobs.set(k(key), { data, metadata: opts?.metadata });
    },
    get: async (key) => memoryBlobs.get(k(key))?.data ?? null,
    getWithMetadata: async (key) => {
      const hit = memoryBlobs.get(k(key));
      return hit ? { data: hit.data, metadata: hit.metadata } : null;
    },
    delete: async (key) => {
      memoryBlobs.delete(k(key));
    },
  };
}

/**
 * 取一个 store。没装过实现时：测试环境退回内存，其余一律抛错。
 *
 * 抛错而不是静默退回内存，是因为「图片写进去了但过一会儿全没了」
 * 这种故障没有任何症状，等发现时数据已经丢了。
 */
export function blobStore(bucket: BlobBucket): BlobStore {
  if (backend) return backend(bucket);
  if (process.env.NODE_ENV === "test") return memoryStore(bucket);

  throw new Error(
    "对象存储没有装配。平台入口必须在启动时调用 setBlobBackend()，" +
      "见 packages/api/src/lib/platform.ts",
  );
}
