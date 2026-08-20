import { Hono } from "hono";
import { adminAccounts } from "./routes/admin-accounts.js";
import { adminArchive } from "./routes/admin-archive.js";
import { adminAudit } from "./routes/admin-audit.js";
import { adminAuth } from "./routes/admin-auth.js";
import { adminSettings } from "./routes/admin-settings.js";
import { auth } from "./routes/auth.js";
import { health } from "./routes/health.js";
import { adminImages, images } from "./routes/images.js";
import { settings } from "./routes/settings.js";
import type { AppEnv } from "./middleware/session.js";

export const app = new Hono<AppEnv>().basePath("/api");

// 公开接口
app.route("/health", health);
// 前台渲染要用的站点设置，内容本来就显示在页面上，不挂鉴权
app.route("/settings", settings);
app.route("/auth", auth);
// 图片要能被 <img> 直接加载，不挂鉴权
app.route("/images", images);

/**
 * 管理后台。守卫挂在各自路由内部，分两档：
 * requireStaff（两种后台角色）—— 日常操作
 * requireAdmin（仅全权管理员）—— 开账号、改站点设置、物理删除
 */
app.route("/admin/auth", adminAuth);
app.route("/admin/accounts", adminAccounts);
app.route("/admin/settings", adminSettings);
// 归档区：各处的删除都只是移到这里，物理删除仅全权管理员可做
app.route("/admin/archive", adminArchive);
app.route("/admin/audit", adminAudit);
app.route("/admin/images", adminImages);

app.onError((err, c) => {
  console.error("[api] 未捕获错误:", err);
  return c.json({ error: "internal_error" }, 500);
});

app.notFound((c) => c.json({ error: "not_found" }, 404));

export type AppType = typeof app;

/**
 * 平台装配接口。
 *
 * 这个包不依赖任何托管平台的 SDK（由 scripts/check-platform.mjs 强制），
 * 平台特有的能力由各自的入口在启动时装进来 —— 目前只有对象存储。
 * 见 lib/platform.ts。
 */
export { setBlobBackend } from "./lib/platform.js";
export type { BlobBackend, BlobBucket, BlobStore } from "./lib/platform.js";
