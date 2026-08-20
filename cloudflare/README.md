# 部署到 Cloudflare Workers

这个目录是 **Netlify 之外的第二个部署入口**，和 `netlify/` 平级。
两边共用 `packages/*` 里全部的业务代码，各自只提供平台特有的那一小块
（目前只有对象存储）。

留着两个入口不是为了真的同时部署两处，而是**验证「平台无关」这条约束是活的**：
`packages/api` 里一旦混进某一家的 SDK，另一个入口立刻编不过。
`scripts/check-platform.mjs` 在构建期做同样的检查。

不需要 Cloudflare 的话，删掉整个目录即可，Netlify 那一路不受任何影响。

---

## ⚠️ 免费版跑不了带密码登录的应用

原因是 **bcrypt**：

| | 值 |
|---|---|
| 免费版每请求 CPU 上限 | **10 ms** |
| `bcrypt.compare`（登录验密码） | **约 48 ms** |
| `bcrypt.hash`（注册、改密码） | **约 57 ms** |

超限的请求会被 Cloudflare 直接掐断，返回 **Error 1102 `Worker exceeded
resource limits`**，表现是登录页一按就报错。付费版（$5/月）默认 30s CPU，绰绰有余。

注意 CPU 时间**不含等 I/O 的时间** —— 等数据库返回不计入。所以除了
登录/注册/改密码这三条路径，其余接口的开销都很低。是 bcrypt 单独撑爆了免费版，
因为它的全部安全价值就在于故意烧 CPU。

**最坑的一点**：本地 `wrangler dev` **不执行**这个限制，所以这个故障
本地完全不复现，一上线登录就全挂。

> 想留在免费版的话，唯一的办法是把密码哈希换成 Web Crypto 的 PBKDF2，
> 并迁移存量哈希。

---

## 首次部署

### 1. 建两个 R2 桶

```bash
npx wrangler@latest r2 bucket create app-public-images
npx wrangler@latest r2 bucket create app-private-files
```

**两个都保持私有，一个都不要在控制台开公开访问。**

公开图片的可读性由 `/api/images/*` 这个路由提供，不靠桶的开关；而
`app-private-files` 里的东西只能经过带鉴权的路由读取。R2 比 Netlify Blobs
多一条风险：**桶可以在控制台里一键开成公开的**（r2.dev 域名或自定义域），
Netlify Blobs 根本没有这个开关。所以这条要专门盯。

### 2. 注入密钥

```bash
npx wrangler@latest secret put DATABASE_URL        --config cloudflare/wrangler.jsonc
npx wrangler@latest secret put DATABASE_AUTH_TOKEN --config cloudflare/wrangler.jsonc
npx wrangler@latest secret put JWT_SECRET          --config cloudflare/wrangler.jsonc
npx wrangler@latest secret put RESEND_API_KEY      --config cloudflare/wrangler.jsonc
```

每条会交互式地问值，**不要写在命令行参数里**（会进 shell 历史）。
非敏感的 `NODE_ENV` 和 `EMAIL_FROM` 在 `wrangler.jsonc` 的 `vars` 里。

### 3. 先干跑一次

```bash
npx wrangler@latest deploy --dry-run --config cloudflare/wrangler.jsonc
```

不部署任何东西，只验证打包 —— libsql / bcryptjs / jose 在 `nodejs_compat`
下能不能正确 bundle、产物大小有没有超限。这一步比直接部署便宜得多。

### 4. 部署

```bash
pnpm run ci && npx wrangler@latest deploy --config cloudflare/wrangler.jsonc
```

先跑守卫 + 测试 + 构建，再上传。`apps/web/dist` 作为静态资源一起上传。

---

## 为什么 packages/db 不用改

`packages/db/src/client.ts` 在**模块顶层**读 `process.env.DATABASE_URL` 并建连接。
这在 Workers 上看起来很可疑，但实测确认：开了 `nodejs_compat` 之后，
`vars` 和 secrets 在模块顶层就已经注入到 `process.env` 里了。
所以 client.ts、auth.ts、email.ts 那几处读环境变量的代码一行都不用动。

`@libsql/client/web` 在 workerd 里能正常实例化 —— 这也是为什么
client.ts 里那个「生产走纯 HTTP 驱动」的分支同时救了 Netlify 和 Cloudflare。

---

## 验证清单

1. `GET /api/health` → 200 且 `dbLatencyMs` 有值（证明连上了数据库）
2. 登录后台 → **免费版上这条必挂**，是判断套餐是否正确的最快方式
3. 上传一张图 → 刷新页面能显示（R2 可写可读）
4. 传一个私密文件，然后**退出登录**去访问它的地址 → 应当 404 而不是返回内容
5. 深链直接访问某个前端路由 → 返回页面而不是 404（SPA 兜底生效）

第 4 条是唯一涉及隐私的，务必实测。

---

## 数据库在哪一区，比在哪家托管更重要

Worker 默认在**离用户最近的**节点跑，而数据库在某个固定的区。
一次页面加载往往有好几次查询，**函数↔数据库的来回会被乘上好几倍**，
代价通常大于用户↔函数那一次。

所以选库的位置要**和函数同区，不是和用户同区**。Cloudflare 这边如果两者
差得远，考虑打开 Smart Placement（`wrangler.jsonc` 里有注释掉的配置），
让 Worker 挪到靠近数据库的地方跑。
