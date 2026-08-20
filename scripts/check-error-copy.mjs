#!/usr/bin/env node
/**
 * 错误文案锁。
 *
 * 界面上永远不该出现「出错了，请稍后重试」这种话 —— 用户提交没成功时，
 * 要么告诉他哪个字段该怎么改，要么告诉他这是网络、权限还是服务端的问题。
 * 前端靠错误码查文案，所以只要 API 里新加了一个错误码而忘了配文案，
 * 用户就会看到一句「操作没有成功（xxx_yyy，HTTP 409）」—— 能查，但不好看。
 *
 * 这个脚本把两边对起来：扫出 API 里所有 `error: "..."` 的取值，
 * 确认中英两份文案里都有对应的 error.code.*。
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = join(root, "packages/api/src");
const localesDir = join(root, "apps/web/src/i18n/locales");

/** 递归收集 .ts 文件 */
function sources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    return entry.name.endsWith(".ts") ? [full] : [];
  });
}

const codes = new Set();
for (const file of sources(apiDir)) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(/\berror:\s*"([a-z_]+)"/g)) codes.add(m[1]);

  /**
   * 有些错误码是校验函数以字符串返回、再由路由塞进 c.json 的
   * （例如 admin-staff.ts 的 validateOwnership）。只认带下划线的，
   * 免得把普通字符串当成错误码。
   */
  for (const m of text.matchAll(/return\s+"([a-z]+_[a-z_]+)"/g)) codes.add(m[1]);

  /**
   * 三元写法：error: cond ? "a_b" : "c_d"。
   * 把带 error: 的整行里所有蛇形字符串都收进来，宁可多认几个 ——
   * 多认的那些反正会在下面「文案里有、接口不返回」那一档被指出来。
   */
  for (const line of text.split("\n")) {
    if (!line.includes("error:")) continue;
    for (const m of line.matchAll(/"([a-z]+_[a-z_]+)"/g)) codes.add(m[1]);
  }
}

/**
 * 这些不需要文案：
 * - unknown_error 是前端自己在响应体解析失败时造的占位
 * - internal_error 有文案，但它也可能由 onError 兜底抛出，一并保留
 */
const locales = Object.fromEntries(
  ["zh", "en"].map((l) => [l, JSON.parse(readFileSync(join(localesDir, `${l}.json`), "utf8"))]),
);

const problems = [];

for (const code of [...codes].sort()) {
  for (const [locale, data] of Object.entries(locales)) {
    if (!data.error?.code?.[code]) {
      problems.push(`${locale}.json 缺少 error.code.${code} 的文案`);
    }
  }
}

// 反向检查：文案里有、API 里已经没有的码，说明改名后忘了清理
for (const [locale, data] of Object.entries(locales)) {
  for (const code of Object.keys(data.error?.code ?? {})) {
    if (!codes.has(code)) {
      problems.push(`${locale}.json 里的 error.code.${code} 已经没有接口会返回，可以删掉`);
    }
  }
}

if (problems.length > 0) {
  console.error("错误文案校验未通过：\n");
  for (const p of problems) console.error(`  ✗ ${p}\n`);
  console.error("文案写在 apps/web/src/i18n/locales/*.json 的 error.code 下");
  process.exit(1);
}

console.log(`错误文案校验通过：${codes.size} 个错误码在中英两份文案里都有对应说明`);
