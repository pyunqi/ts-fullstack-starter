import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { PASSWORD, call, closeDb, login, loginUser, post, seed } from "./fixtures.js";

beforeAll(async () => {
  await seed();
});

afterAll(closeDb);

describe("前台注册与登录", () => {
  it("邮箱和用户名都能登录", async () => {
    expect(await loginUser("user@test.local")).toBeTruthy();
    expect(await loginUser("tester")).toBeTruthy();
  });

  it("大小写不同的邮箱是同一个账号", async () => {
    const res = await post("/auth/login", {
      identifier: "USER@test.local",
      password: "test-password-123",
    });
    expect(res.status).toBe(200);
  });

  it("重复注册分别报错，不含糊", async () => {
    const dupEmail = await post("/auth/register", {
      email: "user@test.local",
      username: "someone-else",
      password: "test-password-123",
      name: "重复",
    });
    expect(dupEmail.status).toBe(409);
    expect(dupEmail.body.error).toBe("email_taken");

    const dupName = await post("/auth/register", {
      email: "fresh@test.local",
      username: "tester",
      password: "test-password-123",
      name: "重复",
    });
    expect(dupName.body.error).toBe("username_taken");
  });

  /**
   * 账号不存在和密码错误必须是同一个错误码 ——
   * 分开报等于给攻击者一个「哪些邮箱注册过」的查询接口。
   */
  it("不暴露账号是否存在", async () => {
    const noSuchUser = await post("/auth/login", {
      identifier: "nobody@test.local",
      password: "whatever-123",
    });
    const wrongPassword = await post("/auth/login", {
      identifier: "user@test.local",
      password: "wrong-password-1",
    });
    expect(noSuchUser.body.error).toBe("invalid_credentials");
    expect(wrongPassword.body.error).toBe("invalid_credentials");
    expect(noSuchUser.status).toBe(wrongPassword.status);
  });
});

describe("改密码会踢掉其他设备", () => {
  it("旧会话立刻失效，当前设备拿到新会话", async () => {
    const oldCookie = await login("root");

    const changed = await post(
      "/admin/auth/password",
      { currentPassword: "test-password-123", newPassword: "brand-new-password-9" },
      oldCookie,
    );
    expect(changed.status).toBe(200);

    // 改密码时会顺手重发一个会话，所以响应里带着可用的新 cookie
    expect(changed.cookie).toBeTruthy();
    expect((await call("/admin/auth/me", { cookie: changed.cookie! })).status).toBe(200);

    // 而旧的那个必须立刻不认 —— 这正是 sessions_valid_from 存在的理由
    expect((await call("/admin/auth/me", { cookie: oldCookie })).status).toBe(401);

    /**
     * 改回去。**同一个测试文件共用一个数据库**（见 test/setup.ts），
     * 不还原的话，后面任何一个 login("root") 都会挂 ——
     * 而报出来的错是「密码不对」，看不出根因在上一个用例里。
     */
    await post(
      "/admin/auth/password",
      { currentPassword: "brand-new-password-9", newPassword: PASSWORD },
      changed.cookie!,
    );
  });
});

describe("停用的账号", () => {
  it("密码正确也登不进来", async () => {
    const cookie = await login("root");
    const [account] = (await call("/admin/accounts", { cookie })).body.filter(
      (a: { username: string }) => a.username === "worker",
    );

    await call(`/admin/accounts/${account.id}`, {
      method: "PATCH",
      body: JSON.stringify({ disabled: true }),
      cookie,
    });

    const res = await post("/admin/auth/login", {
      username: "worker",
      password: PASSWORD,
    });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("account_disabled");
  });
});
