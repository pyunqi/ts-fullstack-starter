import { blobStore, type BlobStore } from "./platform.js";

export type { BlobStore };

/** 只收这三种。svg 刻意排除：它能内嵌脚本，当图片直接吐回浏览器等于开了个 XSS 口子 */
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * 服务端的兜底上限。前端已经用 canvas 压缩过（见 apps/web/src/lib/imageResize.ts），
 * 正常不会碰到这个值；这里防的是绕过前端直接打接口。
 *
 * 注意 Serverless 平台的请求体上限通常比这个值还小
 * （Netlify Functions 约 6MB），所以真正的天花板是平台给的，不是这一行。
 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function isAllowedImageType(contentType: string): boolean {
  return contentType in ALLOWED_TYPES;
}

export function extensionFor(contentType: string): string {
  return ALLOWED_TYPES[contentType] ?? "bin";
}

/**
 * 公开图片的 store。具体是哪家的对象存储由平台入口装配，见 lib/platform.ts。
 *
 * 这些对象走 /api/images/* 那个**不挂鉴权**的路由 ——
 * 它们本来就要能被 <img> 直接加载。
 */
export function imageStore(): BlobStore {
  return blobStore("images");
}

/**
 * 私密文件用**独立的** store，不和公开图片混在一起。
 *
 * 这不是洁癖：只要两者在同一个 store 里，哪天有人给公开路由加一个
 * 「按 key 直取」的便利功能，私密文件就会跟着一起漏出去。
 * 物理隔开之后，那种失误在架构上就做不到。
 *
 * 私密文件只能通过带鉴权且做归属校验的路由读取，响应头带 Cache-Control: private，
 * 越权一律返回 404 而不是 403 —— 403 等于承认「这个东西存在」。
 */
export function privateStore(): BlobStore {
  return blobStore("private");
}

export function buildImageKey(contentType: string): string {
  return `images/${crypto.randomUUID()}.${extensionFor(contentType)}`;
}

export function buildPrivateKey(contentType: string): string {
  return `private/${crypto.randomUUID()}.${extensionFor(contentType)}`;
}

/** 读取路径。key 里带 uuid，内容永不变，所以可以放心让浏览器长期缓存 */
export function publicUrlFor(key: string): string {
  return `/api/images/${key}`;
}

/**
 * 删除对象存储里的图片。
 *
 * **数据库的级联删除管不到对象存储** —— 删记录只会删掉数据库那一行，
 * 对象会永远留在存储里。所以凡是删图片记录的地方都要显式调这个，
 * 而且要在删行**之前**把 key 查出来：行没了就再也不知道该删哪些 key。
 *
 * 单张删除失败不该让整个请求失败（图片已经从页面上消失了，
 * 残留一个孤儿对象是可以接受的代价），所以这里吞掉异常只记日志。
 */
export async function deleteImageBlobs(keys: (string | null | undefined)[]): Promise<void> {
  const actual = keys.filter((k): k is string => Boolean(k));
  /**
   * 没有要删的就直接返回，不去碰对象存储 —— imageStore() 在没装配后端时
   * 会直接抛错。删一个没有配图的对象本来完全不需要连对象存储，
   * 却会在数据库已经删完之后抛出 500，看起来像删除失败。
   */
  if (actual.length === 0) return;

  const store = imageStore();
  await Promise.all(
    actual.map((key) =>
      store.delete(key).catch((err: unknown) => {
        console.error(`[images] 删除 blob 失败（已忽略）: ${key}`, err);
      }),
    ),
  );
}
