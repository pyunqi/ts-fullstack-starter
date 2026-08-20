import { getStore } from "@netlify/blobs";
import type { BlobBackend, BlobStore } from "@app/api";

/**
 * Netlify Blobs 版的对象存储。
 *
 * 在 Netlify Functions 运行时（含 netlify dev）会自动拿到站点凭据，
 * 本地 dev 落在磁盘沙箱里，行为与生产一致，不需要另做一套。
 *
 * Netlify 的 Store 比 BlobStore 宽，用到的四个方法签名一致，所以这里断言一次。
 *
 * **两个用途必须是两个独立的 store**，不能合并：公开图片走
 * `/api/images/*` 那个不挂鉴权的路由（它们本来就要能被 <img> 加载），
 * 私密文件则只能通过带鉴权的路由读取。存在同一个 store 里的话，
 * 哪天有人给公开路由加个「按 key 直取」就会把它们一起漏出去。
 */
const STORE_NAMES = {
  images: "public-images",
  private: "private-files",
} as const;

export const netlifyBlobBackend: BlobBackend = (bucket) =>
  getStore(STORE_NAMES[bucket]) as unknown as BlobStore;
