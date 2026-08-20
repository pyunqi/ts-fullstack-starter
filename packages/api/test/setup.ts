import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * 每个测试文件一个全新的临时库。
 *
 * 这段必须跑在任何 @app/db 的导入之前 —— 那个包在模块顶层就按
 * DATABASE_URL 建好了连接。所以这里只设环境变量，一个 import 都不加，
 * 建表和灌数据留给 test/fixtures.ts（它在测试文件里才被导入）。
 */
const dir = mkdtempSync(join(tmpdir(), "app-test-"));

process.env.DATABASE_URL = `file:${join(dir, "test.db")}`;
process.env.JWT_SECRET = "test-only-secret-not-used-anywhere-else";
process.env.NODE_ENV = "test";
delete process.env.DATABASE_AUTH_TOKEN;
