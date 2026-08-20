#!/usr/bin/env node
/**
 * 平台无关锁。
 *
 * `packages/*` 是业务逻辑，**不允许依赖任何托管平台的 SDK**。
 * 平台特有的能力（目前只有对象存储）由各自的入口装配进来，
 * 装配点在 `packages/api/src/lib/platform.ts`。
 *
 * 为什么要用脚本强制：README 里写了「packages/api 刻意不依赖 Netlify 的运行时 API，
 * 将来要换部署平台只需替换入口」——但这句话曾经**不成立**，
 * 因为 `lib/images.ts` 直接 `import { getStore } from "@netlify/blobs"`。
 * 一句注释拦不住下一个顺手 import 的人，能拦住的只有构建失败。
 *
 * 这条约束的价值不只在于「将来能换平台」，还在于**测试能脱离平台跑** ——
 * 单元测试里那个内存实现之所以能顶替进来，靠的就是这条边界。
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** 被这条约束管住的目录 */
const GUARDED = ["packages/api/src", "packages/db/src", "packages/shared/src"];

/**
 * 平台 SDK 的特征。
 *
 * 用前缀匹配而不是精确列表：新出一个 `@netlify/xxx` 或 `@cloudflare/yyy`
 * 同样该被拦下，不该等到有人踩了才往列表里补一条。
 */
const FORBIDDEN = [
  { pattern: /^@netlify\//, name: "Netlify SDK" },
  { pattern: /^@cloudflare\//, name: "Cloudflare SDK" },
  { pattern: /^cloudflare:/, name: "Cloudflare 内置模块" },
  { pattern: /^@vercel\//, name: "Vercel SDK" },
  { pattern: /^@aws-sdk\//, name: "AWS SDK" },
];

function sources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const problems = [];

for (const guarded of GUARDED) {
  const dir = join(root, guarded);
  for (const file of sources(dir)) {
    const text = readFileSync(file, "utf8");

    /**
     * 静态 import、`export ... from`，以及动态 import() 都要查。
     * client.ts 里就有 `await import("@libsql/client/web")` 这种写法，
     * 只查静态 import 会漏掉同款的平台依赖。
     */
    const specifiers = [
      ...text.matchAll(/(?:^|\n)\s*(?:import|export)[^;\n]*?from\s*["']([^"']+)["']/g),
      ...text.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g),
      ...text.matchAll(/(?:^|\n)\s*import\s+["']([^"']+)["']/g),
    ].map((m) => m[1]);

    for (const spec of specifiers) {
      const hit = FORBIDDEN.find((f) => f.pattern.test(spec));
      if (hit) {
        problems.push(`${relative(root, file)}\n    → import "${spec}"（${hit.name}）`);
      }
    }
  }
}

// package.json 里声明了也算 —— 依赖没被 import 只是暂时的
for (const pkg of ["packages/api", "packages/db", "packages/shared"]) {
  const manifest = JSON.parse(readFileSync(join(root, pkg, "package.json"), "utf8"));
  for (const field of ["dependencies", "peerDependencies"]) {
    for (const dep of Object.keys(manifest[field] ?? {})) {
      const hit = FORBIDDEN.find((f) => f.pattern.test(dep));
      if (hit) problems.push(`${pkg}/package.json 的 ${field} 里有 "${dep}"（${hit.name}）`);
    }
  }
}

if (problems.length > 0) {
  console.error("✗ 业务包里出现了平台 SDK：\n");
  for (const p of problems) console.error(`  ${p}`);
  console.error(
    "\npackages/* 必须保持平台无关。平台特有的能力请在各自的入口装配：\n" +
      "  Netlify   → netlify/functions/api.mts\n" +
      "  Cloudflare → cloudflare/worker.ts\n" +
      "装配点见 packages/api/src/lib/platform.ts。",
  );
  process.exit(1);
}

console.log(`✓ 平台无关校验通过：${GUARDED.length} 个业务包都没有引入托管平台的 SDK`);
