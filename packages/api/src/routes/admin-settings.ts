import { siteSettingsUpdateSchema, testEmailSchema } from "@app/shared";
import { audit } from "../lib/audit.js";
import { Hono } from "hono";
import { isEmailConfigured, sendEmail } from "../lib/email.js";
import { readSettings, writeSettings } from "../lib/settings.js";
import { requireAdmin, type AppEnv } from "../middleware/session.js";

/**
 * 站点设置，只有全权管理员能改 —— 这里控制的是整个站点长什么样。
 */
export const adminSettings = new Hono<AppEnv>();

adminSettings.use("*", requireAdmin);

adminSettings.get("/", async (c) => c.json(await readSettings()));

adminSettings.patch("/", async (c) => {
  const parsed = siteSettingsUpdateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "invalid_input", details: parsed.error.issues }, 400);
  }

  const next = await writeSettings(parsed.data, c.get("adminId"));

  await audit(c, {
    action: "settings.update",
    targetType: "settings",
    summary: `修改站点设置：${Object.keys(parsed.data).join("、")}`,
  });

  return c.json(next);
});

/**
 * 发一封测试邮件。
 *
 * 配好 key 和域名之后最想知道的就是「到底通不通」，而这件事光看代码看不出来 ——
 * 域名没验证、额度用完、地址写错，表现都是「对方没收到」。
 * 有这个按钮就能当场拿到服务商的原话。
 */
adminSettings.post("/test-email", async (c) => {
  const parsed = testEmailSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "invalid_input", details: parsed.error.issues }, 400);
  }

  if (!isEmailConfigured()) {
    return c.json({ error: "email_not_configured" }, 409);
  }

  const result = await sendEmail({
    to: parsed.data.to,
    subject: "邮件配置测试",
    text: [
      "这是一封测试邮件。",
      "",
      "你收到它，说明发件域名、API key 和回复地址都配对了。",
      `发送时间：${new Date().toISOString()}`,
    ].join("\n"),
  });

  await audit(c, {
    action: "settings.update",
    targetType: "settings",
    summary: `发送测试邮件到 ${parsed.data.to}：${result.status}`,
  });

  if (result.status === "failed") {
    // 把服务商的原话带回界面，那句话才是能照着排查的东西
    return c.json({ error: "email_send_failed", message: result.message }, 502);
  }

  return c.json({ ok: true, status: result.status });
});
