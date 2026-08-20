import type { BlobBackend, BlobStore } from "@app/api";

/**
 * R2 版的对象存储，对应 netlify/blob-store.ts。
 *
 * **两个用途必须是两个独立的桶**，理由和 Netlify 那边一样：
 * 公开图片走 `/api/images/*` 那个不挂鉴权的路由（它们本来就要能被
 * <img> 加载），私密文件则只能通过带鉴权的路由读取。
 *
 * R2 这里还多一条 Netlify Blobs 上不存在的风险：**R2 的桶可以在控制台里
 * 一键开启公开访问（r2.dev 域名或自定义域）**。Netlify Blobs 根本没有这个
 * 开关，所以那边不用担心；到了 R2，`app-private-files` 一旦被开成公开桶，
 * 里面的文件就能被任何人按 key 直接下载，绕过我们全部的鉴权校验。
 *
 * 两个桶都保持私有 —— 公开图片的可读性由我们自己的路由提供，不靠桶的开关。
 */
function r2Store(bucket: R2Bucket): BlobStore {
  return {
    set: async (key, data, options) => bucket.put(key, data, toR2Options(options)),

    get: async (key) => {
      const object = await bucket.get(key);
      return object ? await object.arrayBuffer() : null;
    },

    getWithMetadata: async (key) => {
      const object = await bucket.get(key);
      if (!object) return null;
      // arrayBuffer() 会消费 body，所以元数据要在读之前取出来
      const metadata = object.customMetadata;
      return { data: await object.arrayBuffer(), metadata };
    },

    delete: async (key) => bucket.delete(key),
  };
}

/**
 * R2 的 customMetadata 只收字符串值，而 BlobStore 的接口是
 * `Record<string, unknown>`（Netlify Blobs 那边存的是 JSON，什么都能塞）。
 *
 * 实际只用来存 contentType，所以这里统一转成字符串。
 * null/undefined 直接丢掉 —— 转成字面量 "undefined" 再回填到响应头上，
 * 会变成一个看起来像正常值的坏 Content-Type，比缺字段更难查。
 */
function toR2Options(options?: { metadata?: Record<string, unknown> }): R2PutOptions | undefined {
  const metadata = options?.metadata;
  if (!metadata) return undefined;

  const customMetadata: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value !== undefined && value !== null) customMetadata[key] = String(value);
  }
  return { customMetadata };
}

/**
 * 绑定挂在 `env` 上，只有在 fetch handler 里才拿得到 ——
 * 这是和 Netlify 最大的结构差异，见 worker.ts 的说明。
 */
export const r2BlobBackend =
  (env: CloudflareEnv): BlobBackend =>
  (bucket) =>
    r2Store(bucket === "images" ? env.PUBLIC_IMAGES : env.PRIVATE_FILES);
