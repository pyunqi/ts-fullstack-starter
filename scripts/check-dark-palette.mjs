#!/usr/bin/env node
/**
 * 暗色盘完整性锁。
 *
 * 暗色模式的做法是**重定义 CSS 变量**，不给组件加 dark: 前缀
 * （见 apps/web/src/index.css）。好处是全站一次性跟着变，
 * 代价是**只有被重定义过的档位才会变**。
 *
 * 用到一个没定义的档位时不会报任何错 —— 那个颜色只是保持亮色值，
 * 在深色底上会很扎眼。而这种问题只有在暗色模式下打开那个页面才看得见，
 * 很容易一直漏到线上。
 *
 * 所以这里把两边对起来：源码里用到的每一档，暗色块里都要有。
 *
 * 反过来不检查 —— 暗色里多定义几档是无害的（为将来留的），
 * 而删掉一个「暂时没人用」的档位反而会在下次有人用到时留个坑。
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webSrc = join(root, "apps/web/src");
const cssPath = join(webSrc, "index.css");

/** 会随主题翻转的色系。brand-* 是刻意固定的，不参与 */
const THEMED = "gray|green|amber|red|emerald|rose|indigo|cyan";

function sources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

// ---------- 源码里用到哪些档 ----------

const used = new Map(); // "gray-500" -> 第一次出现的文件
const utility = new RegExp(
  `\\b(?:bg|text|border|ring|divide|placeholder|from|via|to|outline|shadow|accent|caret|fill|stroke)-(${THEMED})-(\\d{2,3})\\b`,
  "g",
);

for (const file of sources(webSrc)) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(utility)) {
    const shade = `${m[1]}-${m[2]}`;
    if (!used.has(shade)) used.set(shade, relative(root, file));
  }
}

// ---------- 暗色块里定义了哪些 ----------

const css = readFileSync(cssPath, "utf8");
const darkStart = css.indexOf('[data-theme="dark"]');

if (darkStart < 0) {
  console.error('✗ apps/web/src/index.css 里找不到 [data-theme="dark"] 这一块');
  process.exit(1);
}

const defined = new Set(
  [...css.slice(darkStart).matchAll(/--color-([a-z]+-\d{2,3})\s*:/g)].map((m) => m[1]),
);

// ---------- 对齐 ----------

const missing = [...used.entries()].filter(([shade]) => !defined.has(shade));

if (missing.length > 0) {
  console.error("✗ 这些颜色档位在暗色模式下没有定义：\n");
  for (const [shade, where] of missing.sort()) {
    console.error(`  ${shade.padEnd(14)} 首次出现于 ${where}`);
  }
  console.error(
    "\n没定义的档位在暗色下会保持亮色值，在深色底上很扎眼，而且不报任何错。" +
      "\n请在 apps/web/src/index.css 的暗色块里补上（两处：[data-theme=\"dark\"] " +
      "和 prefers-color-scheme 那一份）。",
  );
  process.exit(1);
}

console.log(`✓ 暗色盘完整：源码用到 ${used.size} 档，全部有定义`);
