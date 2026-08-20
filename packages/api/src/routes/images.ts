import { Hono } from "hono";
import {
  MAX_IMAGE_BYTES,
  buildImageKey,
  imageStore,
  isAllowedImageType,
  publicUrlFor,
} from "../lib/images.js";
import { db, images as imagesTable } from "@app/db";
import { requireStaff, type AppEnv } from "../middleware/session.js";
import { audit } from "../lib/audit.js";

/** 公开读取。图片本来就要能被 <img> 直接加载，不能挂鉴权 */
export const images = new Hono<AppEnv>();

/**
 * key 形如 images/<uuid>.jpg，本身含斜杠，
 * 所以必须用通配路由而不是 /:key，否则永远匹配不到。
 */
images.get("/*", async (c) => {
  const key = c.req.path.replace(/^\/api\/images\//, "");
  if (!key) return c.json({ error: "not_found" }, 404);

  const store = imageStore();
  const result = await store.getWithMetadata(key, { type: "arrayBuffer" });

  if (!result) return c.json({ error: "not_found" }, 404);

  const contentType =
    typeof result.metadata?.contentType === "string"
      ? result.metadata.contentType
      : "application/octet-stream";

  return new Response(result.data, {
    headers: {
      "Content-Type": contentType,
      // key 里带 uuid，同一个 key 的内容永远不变，可以永久缓存
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
});

/** 上传。挂鉴权，公开路由只负责读。 */
export const adminImages = new Hono<AppEnv>();

adminImages.use("*", requireStaff);

adminImages.post("/", async (c) => {
  const contentType = c.req.header("content-type")?.split(";")[0]?.trim() ?? "";

  if (!isAllowedImageType(contentType)) {
    return c.json(
      { error: "unsupported_image_type", message: "只支持 JPEG、PNG、WebP 格式" },
      415,
    );
  }

  const body = await c.req.arrayBuffer();

  if (body.byteLength === 0) return c.json({ error: "empty_body" }, 400);
  if (body.byteLength > MAX_IMAGE_BYTES) {
    return c.json({ error: "image_too_large", message: "图片过大，请压缩后再上传" }, 413);
  }

  const key = buildImageKey(contentType);

  // contentType 存进 metadata：读取时要靠它回填响应头
  await imageStore().set(key, body, { metadata: { contentType } });

  const [row] = await db
    .insert(imagesTable)
    .values({
      blobKey: key,
      contentType,
      byteSize: body.byteLength,
      uploadedBy: c.get("adminId"),
    })
    .returning();

  await audit(c, {
    action: "image.upload",
    targetType: "image",
    targetId: row?.id,
    summary: `上传图片 ${key}`,
  });

  return c.json(
    { id: row?.id, key, url: publicUrlFor(key), sizeBytes: body.byteLength, contentType },
    201,
  );
});
