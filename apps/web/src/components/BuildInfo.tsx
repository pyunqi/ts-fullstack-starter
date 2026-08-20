import { currentLocale } from "../i18n/index.js";
import { dateTime } from "../lib/format.js";

/**
 * 管理端页脚的版本标识。
 *
 * 刻意只有数字没有文字标签：版本号、提交号、构建时间三样在中英文里长得一样，
 * 加了「版本：」这种前缀就得同步两个 locale，而它并不会让人更看得懂。
 *
 * 显示提交号的理由：版本号只在发版时才动，而线上随时可能部署同一版本的不同提交。
 * 运营说「这个按钮点了没反应」时，第一件事是确认对方浏览器里跑的是哪次构建 ——
 * 光有 v0.0.1 回答不了，SPA 又特别容易在浏览器里留着旧缓存。
 */
export function BuildInfo() {
  const builtAt = dateTime(__APP_BUILT_AT__, currentLocale());

  return (
    <p
      className="text-caption text-brand-stone/70 tabular-nums"
      // 完整时间戳留在 title 里：页面上显示的是本地时区的友好格式，
      // 但对时排查问题时需要的是不带歧义的 UTC 原值
      title={__APP_BUILT_AT__}
    >
      v{__APP_VERSION__}
      {" · "}
      <span className="font-mono">{__APP_COMMIT__}</span>
      {" · "}
      {builtAt}
      {/* dev 模式下提交号指向 HEAD，但工作区几乎总有未提交的改动，标出来免得当真 */}
      {import.meta.env.DEV && " · dev"}
    </p>
  );
}
