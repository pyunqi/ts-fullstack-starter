import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { call, closeDb, del, login, post, seed, type Fixture } from "./fixtures.js";

/**
 * 角色矩阵。
 *
 * 这类测试的价值不在于「现在是对的」，而在于**以后有人加接口时会挂**：
 * 新接口忘了挂守卫，这里会立刻变红。所以逐个接口断言，不要图省事只测一两个。
 */
let fx: Fixture;

beforeAll(async () => {
  fx = await seed();
});

afterAll(closeDb);

describe("未登录", () => {
  it("公开接口可读", async () => {
    expect((await call("/health")).status).toBe(200);
    expect((await call("/settings")).status).toBe(200);
  });

  it("后台接口一律 401", async () => {
    for (const path of ["/admin/accounts", "/admin/settings", "/admin/archive", "/admin/audit"]) {
      expect((await call(path)).status, path).toBe(401);
    }
  });
});

describe("受限角色（staff）", () => {
  it("能取回自己的身份", async () => {
    const cookie = await login("worker");
    const res = await call("/admin/auth/me", { cookie });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("staff");
  });

  it("碰不到只给管理员的接口", async () => {
    const cookie = await login("worker");
    for (const path of ["/admin/accounts", "/admin/settings", "/admin/audit"]) {
      expect((await call(path, { cookie })).status, path).toBe(403);
    }
  });

  it("能改自己的密码", async () => {
    const cookie = await login("worker");
    const res = await post(
      "/admin/auth/password",
      { currentPassword: "test-password-123", newPassword: "another-password-456" },
      cookie,
    );
    expect(res.status).toBe(200);
  });
});

describe("管理员", () => {
  it("能开账号、能看日志", async () => {
    const cookie = await login("root");
    expect((await call("/admin/accounts", { cookie })).status).toBe(200);
    expect((await call("/admin/audit", { cookie })).status).toBe(200);
  });

  /**
   * 不能停用/降级自己 —— 这两条同时保证了「零管理员」不可达。
   * 见 routes/admin-accounts.ts 里的推理，加批量操作时那个推理会失效。
   */
  it("不能把自己锁在门外", async () => {
    const cookie = await login("root");
    const disabled = await call(`/admin/accounts/${fx.accounts.admin}`, {
      method: "PATCH",
      body: JSON.stringify({ disabled: true }),
      cookie,
    });
    expect(disabled.status).toBe(400);
    expect(disabled.body.error).toBe("cannot_disable_self");

    const archived = await del(`/admin/accounts/${fx.accounts.admin}`, cookie);
    expect(archived.status).toBe(400);
  });
});
