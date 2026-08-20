import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    /**
     * setupFiles 在测试文件被导入之前执行，这一点是必须的：
     * @app/db 在模块顶层就按 DATABASE_URL 建好了连接，
     * 环境变量必须赶在那之前设好，否则测试会连到开发库上（然后把它写花）。
     */
    setupFiles: ["./test/setup.ts"],
    /**
     * 每个测试文件一个进程，配合 setup 里的「一文件一临时库」，
     * 文件之间不共享任何状态，跑失败时不用怀疑是别的文件留下的脏数据。
     */
    pool: "forks",
    poolOptions: { forks: { singleFork: false } },
    include: ["test/**/*.test.ts"],
    testTimeout: 20_000,
  },
});
