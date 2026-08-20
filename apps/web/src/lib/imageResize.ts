/**
 * 上传前在浏览器里压缩图片。
 *
 * 这一步不是优化，是必需的：Netlify Functions 的请求体上限约 6MB，
 * 而手机直出照片动辄 4~8MB，不压缩会直接失败。
 *
 * **按宽度限，不按最长边限。** 原来卡的是最长边 1600px，对普通照片
 * 没问题，但详情长图是另一种形状 —— 一张 1080×3000 的切片会被压成
 * 576×1600，图上的字直接糊掉；不切片的 750×8000 更是压成 150 宽，
 * 整张废掉。而那恰恰是「无缝排版」这个功能要用的图。
 *
 * 宽度才是决定清晰度的那一维：图在页面上总是撑满容器宽度，
 * 高度爱多长多长。所以限宽 1600、不限高。
 */
const MAX_WIDTH = 1600;

/**
 * 但也不能完全不管高：极端长图会撑爆 canvas。
 * 各浏览器的上限不一，iOS Safari 尤其保守，16384 是个各家都扛得住的值。
 */
const MAX_HEIGHT = 16384;

const QUALITY = 0.82;

/** 后端只收这三种，这里保持一致，提前把不支持的格式挡在上传之前 */
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

export function isAcceptedImage(file: File): boolean {
  return ACCEPTED.includes(file.type);
}

export async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);

  const scale = Math.min(
    1,
    MAX_WIDTH / bitmap.width,
    MAX_HEIGHT / bitmap.height,
  );
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    // 取不到 canvas 上下文时原样上传，让后端的大小校验来兜底
    return file;
  }

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  /**
   * PNG 保持 PNG：商品图里的 PNG 往往带透明背景，转成 JPEG 会出现黑底。
   * 其余一律转 WebP，同画质下体积明显更小。
   */
  const type = file.type === "image/png" ? "image/png" : "image/webp";

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, QUALITY),
  );

  // 压缩反而变大时（小图、已压过的图）就用原文件
  if (!blob || blob.size >= file.size) return file;
  return blob;
}
