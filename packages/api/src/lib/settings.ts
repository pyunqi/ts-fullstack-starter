import { db, siteSettings } from "@app/db";
import {
  SITE_SETTINGS_DEFAULTS,
  siteSettingsSchema,
  type SiteSettings,
  type SiteSettingsUpdate,
} from "@app/shared";
import { eq } from "drizzle-orm";

/**
 * 值统一用 JSON 编码存文本列。
 *
 * 直接存 "true" / 裸字符串也能用，但那样每加一个非字符串类型的设置项
 * 都要再想一次「这个字段怎么解析」。JSON 一开始就把这件事定死了。
 */
function decode(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    // 手工改库改坏了之类，当成没设置过，让上层回落默认值
    return undefined;
  }
}

/**
 * 读取全部站点设置。
 *
 * 数据库里没有的键不是错误，是「还没改过」—— 一律回落到 shared 里的默认值。
 * 整体校验失败（比如某个值被改成了非法类型）也回落，而不是让前台跟着 500：
 * 一个配置项坏掉不该把整个站点带下线。
 */
export async function readSettings(): Promise<SiteSettings> {
  const rows = await db
    .select({ key: siteSettings.key, value: siteSettings.value })
    .from(siteSettings);

  const raw: Record<string, unknown> = {};
  for (const row of rows) {
    const value = decode(row.value);
    if (value !== undefined) raw[row.key] = value;
  }

  const parsed = siteSettingsSchema.safeParse(raw);
  return parsed.success ? parsed.data : SITE_SETTINGS_DEFAULTS;
}

/** 只写提交过的项，其余保持原样。返回写完之后的完整设置 */
export async function writeSettings(
  patch: SiteSettingsUpdate,
  adminId: string,
): Promise<SiteSettings> {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);

  for (const [key, value] of entries) {
    const encoded = JSON.stringify(value);
    /**
     * upsert 而不是先查后写：设置项第一次被改时数据库里根本没有这一行，
     * 而并发两个管理员同时改同一项时，先查后写会有一个插入撞主键。
     */
    await db
      .insert(siteSettings)
      .values({ key, value: encoded, updatedBy: adminId })
      .onConflictDoUpdate({
        target: siteSettings.key,
        set: { value: encoded, updatedBy: adminId, updatedAt: new Date() },
      });
  }

  return readSettings();
}

/** 单项读取的便捷入口，只需要一个开关时用它，不必把整份设置读出来 */
export async function readSetting<K extends keyof SiteSettings>(key: K): Promise<SiteSettings[K]> {
  const [row] = await db
    .select({ value: siteSettings.value })
    .from(siteSettings)
    .where(eq(siteSettings.key, key))
    .limit(1);

  if (!row) return SITE_SETTINGS_DEFAULTS[key];

  const parsed = siteSettingsSchema.safeParse({ [key]: decode(row.value) });
  return parsed.success ? parsed.data[key] : SITE_SETTINGS_DEFAULTS[key];
}
