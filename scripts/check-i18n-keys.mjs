#!/usr/bin/env node
/**
 * 界面文案锁。
 *
 * 界面上永远不该出现 `archive.type.account` 这种原始的键名 ——
 * 那是 i18n 查不到文案时的兜底表现，用户看到的是一段程序内部的标识符。
 *
 * 这类问题**不会**被 typecheck 或测试发现：`t()` 收的是字符串，
 * 少一条翻译在编译期和运行期都不报错，只是那一处默默显示成键名。
 * 而且最容易漏的恰恰是拼出来的键（`t(\`archive.type.${type}\`)`），
 * 因为往枚举里加一个取值时，没有任何东西提醒你去补文案。
 *
 * 所以这里查两件事：
 *
 * 1. **写死的键**：扫出前端所有 `t("...")`，确认中英两份都有。
 * 2. **拼出来的键**：下面 FAMILIES 里逐个声明「这一族的取值来自哪个枚举」，
 *    枚举直接从 shared 的源码里读。往枚举里加取值而忘了补文案，这里会挂。
 *
 * 枚举读的是源码而不是 packages/shared/dist —— `pnpm check` 跑在
 * `turbo run build` 之前，dist 可能还不存在或者是上一次的。
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webSrc = join(root, "apps/web/src");
const localesDir = join(webSrc, "i18n/locales");
const sharedSchemas = join(root, "packages/shared/src/schemas.ts");

// ---------- 从 shared 源码里读枚举 ----------

const schemaText = readFileSync(sharedSchemas, "utf8");

function enumValues(name) {
  const m = schemaText.match(new RegExp(`export const ${name} = \\[([^\\]]*)\\]`));
  if (!m) {
    console.error(`✗ 在 packages/shared/src/schemas.ts 里找不到枚举 ${name}`);
    process.exit(1);
  }
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

/**
 * 拼出来的键都在这里登记。
 *
 * `values` 写枚举名就是「整个枚举都要有文案」；写数组则是显式的取值清单，
 * 用于那些取值不是一整个枚举的地方 —— 每个都注明了为什么。
 */
const FAMILIES = [
  { prefix: "admin.role", values: "ADMIN_ROLES" },
  { prefix: "archive.type", values: "ARCHIVE_TYPES" },
  {
    /** 配色档位，取值是 apps/web/src/lib/theme.ts 里的 THEMES */
    prefix: "theme",
    values: ["system", "light", "dark"],
    extra: ["label"],
  },
  {
    /** 操作日志的动作分组，取值是 AdminAudit.tsx 里的 ACTION_GROUPS */
    prefix: "admin.auditGroup",
    values: ["auth", "account", "user", "image", "settings", "archive"],
    extra: ["all"],
  },
];

// ---------- 收集前端源码 ----------

function sources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const files = sources(webSrc);

// ---------- 载入两份文案 ----------

const locales = {};
for (const name of ["zh", "en"]) {
  locales[name] = JSON.parse(readFileSync(join(localesDir, `${name}.json`), "utf8"));
}

const lookup = (obj, path) =>
  path.split(".").reduce((node, key) => (node && typeof node === "object" ? node[key] : undefined), obj);

const problems = [];

function require_(key, where) {
  for (const [name, dict] of Object.entries(locales)) {
    if (typeof lookup(dict, key) !== "string") {
      problems.push(`${name}.json 缺 ${key}  ← ${where}`);
    }
  }
}

// ---------- 1. 写死的键 ----------

for (const file of files) {
  const text = readFileSync(file, "utf8");
  const where = relative(root, file);
  for (const m of text.matchAll(/\bt\(\s*"([a-zA-Z0-9_.]+)"/g)) require_(m[1], where);
}

// ---------- 2. 拼出来的键 ----------

/**
 * 顺带确认这一族在源码里真的还在用。
 * 删掉了某个用法却留着这条声明的话，这里会提醒把声明也删掉 ——
 * 否则这份清单会慢慢变成一堆没人看的过期规则。
 */
const allText = files.map((f) => readFileSync(f, "utf8")).join("\n");

/**
 * 先确认没有「没登记」的拼接键。
 *
 * 不做这一步的话，这个脚本自己会有洞：新写一处
 * `t(\`foo.bar.${x}\`)` 而不在 FAMILIES 里登记，它就完全查不到，
 * 而那恰恰是最容易漏文案的写法。
 *
 * **先捞出所有含 `${` 的模板参数，再判断它长得对不对**，而不是
 * 「符合某种格式才检查」—— 后者写成 `` t(`admin.stampForm.rule${x}`) ``
 * （`${` 前面没有点）就整个绕过去了，我自己踩过一次。
 * 现在这种写法会被明确拒绝，因为静态上没法知道这一族有哪些取值。
 */
const declared = new Set(FAMILIES.map((f) => f.prefix));
for (const file of files) {
  const text = readFileSync(file, "utf8");
  const where = relative(root, file);

  for (const m of text.matchAll(/\bt\(\s*`([^`]*\$\{[^`]*)`/g)) {
    const template = m[1];
    // 能静态解析的只有 `前缀.${...}` 这一种形状：点之前是固定的族名
    const shaped = /^([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*)\.\$\{/.exec(template);

    if (!shaped) {
      problems.push(
        `${where} 里的 t(\`${template}\`) 没法静态解析。` +
          `拼接键只能写成 \`族名.\${取值}\`，插值前必须是一个以点结尾的固定前缀 —— ` +
          `否则这个脚本看不出它有哪些取值，漏文案就查不出来`,
      );
      continue;
    }

    if (!declared.has(shaped[1])) {
      problems.push(
        `${where} 里的拼接键 ${shaped[1]}.\${...} 没有登记，` +
          `请在 scripts/check-i18n-keys.mjs 的 FAMILIES 里加一条`,
      );
    }
  }
}

for (const family of FAMILIES) {
  if (!allText.includes(`${family.prefix}.\${`)) {
    problems.push(
      `FAMILIES 里的 ${family.prefix} 在前端已经没有拼接用法了，请删掉这条声明`,
    );
    continue;
  }

  const values = Array.isArray(family.values) ? family.values : enumValues(family.values);
  for (const value of [...values, ...(family.extra ?? [])]) {
    require_(`${family.prefix}.${value}`, `拼接键 ${family.prefix}.\${...}`);
  }
}

// ---------- 结果 ----------

if (problems.length > 0) {
  console.error("✗ 界面文案缺失：\n");
  for (const p of problems) console.error(`  ${p}`);
  console.error(
    "\n少了文案的地方会在界面上直接显示成键名。请在 apps/web/src/i18n/locales/ 的两份 JSON 里补上。",
  );
  process.exit(1);
}

const familyKeys = FAMILIES.reduce(
  (n, f) =>
    n + (Array.isArray(f.values) ? f.values.length : enumValues(f.values).length) + (f.extra?.length ?? 0),
  0,
);
console.log(`✓ 界面文案齐全（${FAMILIES.length} 族拼接键共 ${familyKeys} 条，中英各一份）`);
