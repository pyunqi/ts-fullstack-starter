import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * 版本号只有根 package.json 一个来源，构建时读出来编译进包里。
 * 不在前端源码里另写一份常量 —— 那样迟早会和 package.json 对不上，
 * 而且对不上的时候没有任何东西会报错。
 */
const rootPkg = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as { version: string };

/**
 * 提交号。光有版本号不够用：版本号只有发版时才动，而线上随时可能部署
 * 同一版本的不同提交，出问题时要能确认「浏览器里跑的到底是哪次构建」。
 *
 * Netlify 构建环境注入 COMMIT_REF，但它的仓库是浅克隆，git 命令未必可用，
 * 所以优先读环境变量，读不到再退回 git，最后兜底 unknown（比如从 tarball
 * 构建，根本没有 .git 目录）。取不到提交号绝不能把整个构建搞失败。
 */
function commitRef(): string {
  if (process.env.COMMIT_REF) return process.env.COMMIT_REF.slice(0, 7);
  try {
    return execFileSync("git", ["rev-parse", "--short=7", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(rootPkg.version),
    __APP_COMMIT__: JSON.stringify(commitRef()),
    // dev 模式下这是 vite 启动的时刻，不是页面刷新的时刻 —— 配置只求值一次
    __APP_BUILT_AT__: JSON.stringify(new Date().toISOString()),
  },
  server: {
    port: 5173,
  },
});
