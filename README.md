# ts-fullstack-starter

一个全栈骨架：**Hono + React + libSQL**，跑在 Netlify Functions 或 Cloudflare Workers 上。

它不是脚手架生成器，是一份**从真实项目里剥出来的地基** ——
每一处不显然的写法背后都有一次踩过的坑，理由写在注释里。

## 开箱就有的东西

| | |
| --- | --- |
| 两套独立身份 | 前台用户和后台账号是两张表、两种会话，互不相通 |
| 会话可吊销 | 改密码立刻踢掉其他设备（JWT 本身没有吊销手段，靠 `sessions_valid_from`）|
| 删除即归档 | 删除只打标记，归档区可恢复；物理删除是第二个显式动作 |
| 审计日志 | 谁在什么时候改了什么，操作人信息写入时快照 |
| 限流 | 登录、注册、改密码，计数**存库**不存内存 |
| 对象存储 | 公开图片 + 私密文件两个独立 store，平台实现可插拔 |
| 邮件 | Resend REST，没配 key 时不发信只记日志（本地和测试不会误发）|
| 中英双语 | 少一条文案构建期就挂，不会漏到界面上 |
| 亮/暗主题 | 靠重定义 CSS 变量，不给组件加 `dark:` 前缀 |
| 五个守卫 | 把上面这些约定变成构建期会挂的检查 |
| 双平台入口 | Netlify 和 Cloudflare 各一个，共用全部业务代码 |

**没有的东西**（刻意的）：ORM 之外的抽象层、状态管理库、组件库、
多租户、支付、任何业务模型。

## 快速开始

需要 Node 22.22.0（有 `.nvmrc`）和 pnpm。`pnpm dev` 还需要全局装一个
Netlify CLI（`npm i -g netlify-cli`）—— 它同时提供函数运行时和本地对象存储，
两样都是 Vite 单独跑不出来的。

```bash
nvm use && corepack enable pnpm && pnpm install
cp .env.example .env
pnpm db:generate && pnpm db:migrate && pnpm db:seed
pnpm dev                      # http://localhost:8888
```

种子账号：`admin` / `admin12345`（后台 `/admin/login`）、`staff` / `staff12345`、
前台 `user@example.com` / `demo12345`。

## 用它开新项目

**用 Claude Code 开的话，先看 [docs/new-project.md](docs/new-project.md)** ——
那份讲的是人和模型分别该做什么，以及为什么第一件事是改 `CLAUDE.md` 而不是写代码。

手工上手的话，六步：

1. 改名：根 `package.json` 的 `name`、`apps/web/index.html` 的 `<title>`、
   `apps/web/public/brand/` 里的三个占位 SVG、i18n 里的 `brand`。
   包名 `@app/*` 可以留着 —— 它不出现在任何对外的地方。
2. 改 `CLAUDE.md`：把「这是什么」换成真实描述，删掉不适用的约束。
   **留一份和代码对不上的说明比没有说明更糟。**
3. 定色：`apps/web/src/index.css` 顶部七个 `--color-brand-*`，改完全站跟着变。
4. 定时区和币种：`apps/web/src/lib/format.ts` 的 `TIME_ZONE`、
   `packages/shared/src/money.ts` 的两个常量。
5. 建你的表：`packages/db/src/schema.ts`。加 `archived_at` 的话记得接进归档区，
   `pnpm check` 会提醒你。
6. 删掉用不上的：不打算上 Cloudflare 就删 `cloudflare/`，不需要图片上传就删
   `images` 那张表和相关路由。**删比留着一堆没人维护的代码好。**

## 目录

```
apps/web/            React 前端
packages/api/        Hono 路由、鉴权、业务逻辑（不依赖托管平台运行时）
packages/db/         Drizzle schema、连接、迁移、种子
packages/shared/     前后端共用的 zod 校验和类型
netlify/functions/   薄适配层，把请求转交给 packages/api
cloudflare/          同上，另一个平台
scripts/             五个构建期守卫
docs/patterns/       没有默认装配、但需要时可以照着加的东西
.claude/             项目共享的 Claude Code 配置（只放只读和幂等命令的允许清单）
```

## 五个守卫

```bash
pnpm check    # 秒级，部署也跑这个（在 pnpm run ci 里）
```

它们守的都是**漏了不报错**的约定：

- `check-archive` —— 表上有 `archived_at` 就必须接进归档区，否则删了没有恢复入口
- `check-i18n-keys` —— 界面上不会露出 `archive.type.account` 这样的原始键名
- `check-error-copy` —— API 里每个错误码都有中英说明
- `check-platform` —— 业务包里不出现托管平台的 SDK
- `check-dark-palette` —— 用到的每个颜色档位在暗色下都有定义

这类约定的共同点是：typecheck 和测试都发现不了，而症状要等用户碰到才暴露。
**加新约定前先问：漏了会不会立刻报错？** 会的话不值得写脚本。

## 部署

支持两条路，共用全部业务代码：

- **Netlify** —— 构建命令 `pnpm run ci`，发布目录 `apps/web/dist`，
  函数在 `netlify/functions/`。配置见 `netlify.toml`（里面每段都有注释说明为什么这么写）。
- **Cloudflare Workers** —— 见 `cloudflare/README.md`。
  ⚠️ 免费版跑不了 bcrypt 登录，那份文档第一节讲了原因。

生产环境必须配的环境变量：`DATABASE_URL`（`libsql://`）、`DATABASE_AUTH_TOKEN`、
`JWT_SECRET`、`NODE_ENV=production`。邮件另需 `RESEND_API_KEY` + `EMAIL_FROM`。
**一个都不要写进 `netlify.toml` 或 `wrangler.jsonc`** —— 那两个文件在 git 里。

建表不随部署自动发生，要显式跑：

```bash
DATABASE_URL=libsql://... DATABASE_AUTH_TOKEN=... pnpm db:migrate
```

**别用 `drizzle-kit push`** —— 它不写迁移记录表，之后任何一次 `db:migrate`
都会以为库是空的，从头重放全部迁移然后撞上已存在的表。

建完表 `admins` 是空的，谁都登不进后台：

```bash
DATABASE_URL=... DATABASE_AUTH_TOKEN=... \
BOOTSTRAP_ADMIN_USERNAME=<用户名> BOOTSTRAP_ADMIN_PASSWORD='<强密码>' \
pnpm db:bootstrap
```

## 几个容易踩的地方

这些都是实测确认过的，不是理论风险。

- **数据库驱动按协议分叉**（`packages/db/src/client.ts`）。本地 `file:` 走 node 驱动
  （依赖平台原生 `.node` 绑定），生产 `libsql://` 必须走 `@libsql/client/web` 这个纯
  HTTP 驱动。Serverless 打包器不会带上原生绑定，无条件用 node 驱动的话，
  部署后函数一加载就 `MODULE_NOT_FOUND`。**改这个文件时务必保留分支。**
- **SPA 兜底规则必须按 context 声明**，不能写成顶层的 `[[redirects]]`，
  也不能放进 `apps/web/public/_redirects`。原因写在 `netlify.toml` 的注释里 ——
  两种写法都会让本地 dev 白屏，而且只看 HTTP 状态码发现不了（都是 200，要看 content-type）。
- **`netlify dev` 会把路由处理函数里返回的 403 改写成 404**。中间件返回的 403 不受影响。
  这是开发代理的行为，不是代码问题，但首次部署后要在线上复核一次。
- **`packages/db` 显式依赖 `@opentelemetry/api` 不是多余的。** 它是 drizzle-orm 的可选
  peer，只有 api 能看到它时，pnpm 会给两个包各生成一份 peer 解析不同的 drizzle-orm，
  类型带私有字段互不兼容，typecheck 直接失败。删掉就会复现。
- **不要把 `bcryptjs` 换成原生 `bcrypt`**，Serverless 打包会失败。
- **删图片记录时必须显式删对象存储里的对象**，数据库的级联删除管不到它；
  而且要在删行**之前**把 key 查出来。
- **`pnpm-lock.yaml` 必须在仓库根**，Netlify 的 base 目录保持不设置，
  否则它检测不到 pnpm，会回退用 npm 然后失败。
- **`pnpm ci` 不是 `pnpm run ci`** —— 前者是 pnpm 内置的安装命令。
- **改了某个包的 `package.json` 之后**，`pnpm install` 可能只回一句
  "Already up to date" 而不实际链接。删掉 `node_modules/.pnpm-workspace-state-v1.json`
  再装，`--force` 没用。
- **dev server 开久了页脚版本号会骗人** —— `vite.config.ts` 里那几个常量是配置加载
  那一刻求值一次的，HMR 不重算。版本号对不上先想这个。

## 想加多租户

`docs/patterns/multi-tenant.md` 里有完整的做法：一个 `Scope` 类型、
一个构建期守卫、以及一份「哪些地方会漏」的清单。
**刻意不默认装配** —— 单租户项目要先花半天删掉它，那比从零加还慢。
