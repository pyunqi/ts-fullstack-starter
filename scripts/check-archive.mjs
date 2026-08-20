/**
 * 归档区完整性锁。
 *
 * 这套骨架里「删除」只是打 `archived_at` 标记，真正的物理删除只在归档区发生。
 * 所以**一张表加了 `archived_at`，就必须同时接进归档区**：加进
 * `ARCHIVE_TYPES`、在 `admin-archive.ts` 的 `archivedAtOf` 里挂上，
 * 还要出现在 `typesFor` 返回的清单里。
 *
 * 少任何一步，那类数据被删之后归档区列不出它 —— 从用户角度看和物理删除
 * 没有区别，而界面上还写着「可以恢复」。这个守卫来自一次真实的疏漏：
 * 一类数据接漏了一处，没有任何东西报错，是靠人翻页才发现的。
 *
 * 这类问题 typecheck 抓不到：`archivedAt: archivedAt()` 是一个合法的列声明，
 * 不接进归档区不会让任何代码编译失败，只是那条恢复路径根本不存在。
 *
 * 刻意物理删除的表在下面的 PHYSICAL_DELETE 里逐个列出，
 * 每一条都要写清楚理由 —— 让例外是有名有姓的决定，而不是无声的疏忽。
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const SCHEMA = "packages/db/src/schema.ts";
const SHARED = "packages/shared/src/schemas.ts";
const ARCHIVE = "packages/api/src/routes/admin-archive.ts";

const read = (rel) => readFileSync(resolve(root, rel), "utf8");

/**
 * 有 `archived_at` 列、但**刻意**不进归档区的表。
 *
 * 加进这张表之前先想清楚：用户点的那个「删除」按钮之后还能不能反悔？
 * 不能反悔的话，界面上就不该写「删除」以外的任何暗示。
 */
const PHYSICAL_DELETE = {
  // 例：
  // partnerDocuments:
  //   "协议这类文件应该少而精，传错了当场删掉重传，比在归档区留一堆作废版本更清楚。" +
  //   "谁在什么时候删的，审计日志里有。这张表上的 archivedAt 列只是共用了字段定义，从来不写它。",
};

const problems = [];

// ---------- 1. schema 里哪些表有 archived_at ----------

const schemaText = read(SCHEMA);

/**
 * 按 `export const X = sqliteTable(` 切块，再看块里有没有 `archivedAt:`。
 *
 * 不解析 TS 而是切文本：这个脚本要能在装依赖之前跑，
 * 而且 schema 的写法一直是这一种，真变了这里会直接报「一张表都没找到」。
 */
const blocks = schemaText.split(/(?=export const \w+ = sqliteTable\()/);
const archivedTables = [];

for (const block of blocks) {
  const m = /^export const (\w+) = sqliteTable\(\s*\n?\s*"([a-z_]+)"/.exec(block);
  if (!m) continue;
  if (/^\s*archivedAt:\s*archivedAt\(\)/m.test(block)) {
    archivedTables.push({ constName: m[1], tableName: m[2] });
  }
}

if (archivedTables.length === 0) {
  problems.push(
    `${SCHEMA} 里一张带 archived_at 的表都没找到 —— ` +
      `多半是 schema 的写法变了，请同步改 scripts/check-archive.mjs 的解析`,
  );
}

// ---------- 2. 归档区认得哪些类型 ----------

const sharedText = read(SHARED);
const typesMatch = /export const ARCHIVE_TYPES = \[([^\]]*)\]/.exec(sharedText);
if (!typesMatch) {
  problems.push(`${SHARED} 里找不到 ARCHIVE_TYPES`);
}
const archiveTypes = typesMatch ? [...typesMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];

const archiveText = read(ARCHIVE);

/** `archivedAtOf` 是类型和表的唯一挂接点，从它反推每一类归档打在哪张表上 */
const mapMatch = /const archivedAtOf = \{([\s\S]*?)\} as const;/.exec(archiveText);
if (!mapMatch) {
  problems.push(`${ARCHIVE} 里找不到 archivedAtOf 这张映射表`);
}

const wiredTo = new Map(); // 表的 const 名 -> 归档类型
for (const m of (mapMatch?.[1] ?? "").matchAll(/(\w+):\s*(\w+)\.archivedAt/g)) {
  wiredTo.set(m[2], m[1]);
}

/** 平台管理员那一份清单，界面上真正列得出来的类型 */
const typesForMatch = /function typesFor\([\s\S]*?\n\}/.exec(archiveText);
const listedTypes = new Set(
  [...(typesForMatch?.[0] ?? "").matchAll(/"([a-z]+)"/g)].map((m) => m[1]),
);

// ---------- 3. 三边对齐 ----------

for (const { constName, tableName } of archivedTables) {
  if (PHYSICAL_DELETE[constName]) {
    // 例外也要对齐：既然刻意不进归档区，就不该出现在映射表里
    if (wiredTo.has(constName)) {
      problems.push(
        `${tableName} 在 PHYSICAL_DELETE 里标成「刻意物理删除」，` +
          `却又挂进了 ${ARCHIVE} 的 archivedAtOf。两处只能留一处`,
      );
    }
    continue;
  }

  const type = wiredTo.get(constName);
  if (!type) {
    problems.push(
      `${tableName}（${constName}）有 archived_at 列，但没接进归档区。\n` +
        `    请在 ${SHARED} 的 ARCHIVE_TYPES 里加一个类型，\n` +
        `    在 ${ARCHIVE} 的 archivedAtOf 和 typesFor 里挂上；\n` +
        `    如果这张表是刻意物理删除的，写进 scripts/check-archive.mjs 的 PHYSICAL_DELETE 并说明理由`,
    );
    continue;
  }

  if (!archiveTypes.includes(type)) {
    problems.push(
      `${ARCHIVE} 的 archivedAtOf 里有 "${type}"，但 ${SHARED} 的 ARCHIVE_TYPES 没有它`,
    );
  }

  if (!listedTypes.has(type)) {
    problems.push(
      `归档类型 "${type}"（${tableName}）没有出现在 typesFor 返回的清单里 —— ` +
        `接是接上了，但归档区界面上列不出来`,
    );
  }
}

for (const type of archiveTypes) {
  if (![...wiredTo.values()].includes(type)) {
    problems.push(
      `ARCHIVE_TYPES 里的 "${type}" 在 ${ARCHIVE} 的 archivedAtOf 里没有对应的表 —— ` +
        `要么补上，要么从 ARCHIVE_TYPES 里删掉`,
    );
  }
}

// ---------- 结果 ----------

if (problems.length > 0) {
  console.error("✗ 归档区没接全：\n");
  for (const p of problems) console.error(`  ${p}`);
  console.error(
    "\n没接进归档区的数据，删掉之后就没有恢复入口了 —— " +
      "对用户来说等于物理删除，而界面上还写着可以恢复。见 docs/design.md「删除即归档」。",
  );
  process.exit(1);
}

const skipped = Object.keys(PHYSICAL_DELETE).length;
console.log(
  `✓ 归档区：${archivedTables.length - skipped} 张表已接入` +
    (skipped > 0 ? `，${skipped} 张刻意物理删除` : ""),
);
