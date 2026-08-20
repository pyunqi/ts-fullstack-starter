# CLAUDE.md

给 AI 协作者的入口。这份文件只讲**动手之前必须知道的**，其余指路。

> 这是一个**骨架**，不是一个产品。它装的是登录、账号、归档、审计、限流、
> 双语、暗色和五个构建期守卫。业务代码一行都没有 —— 那部分由你来加。
>
> 用它开新项目时，**这份 CLAUDE.md 要跟着项目改**：把「这是什么」换成
> 真实的项目描述，把不适用的约束删掉。留着一份和代码对不上的说明，
> 比没有说明更糟。

## 命令

```bash
pnpm dev          # 先编 packages，再起 netlify dev，http://localhost:8888
pnpm dev:packages # 另开一个终端跑 tsc watch（改 packages/* 时需要）
pnpm check        # 五个守卫，秒级
pnpm test         # 全部测试
pnpm run ci       # 守卫 + 测试 + 构建 —— 提交前跑这条，部署跑的也是它
```

**`pnpm run ci` 不能写成 `pnpm ci`** —— 后者是 pnpm 内置的安装命令，会静默
跳过你的脚本、去装依赖。

**改了 `packages/api|db|shared` 必须重新编译**才能被函数看到（它们是以 `dist/` 被引用的）。
只改 `apps/web` 有 Vite HMR，不用管。

## 首次跑起来

```bash
nvm use && corepack enable pnpm && pnpm install
cp .env.example .env
pnpm db:generate && pnpm db:migrate && pnpm db:seed
pnpm dev
```

种子账号：后台 `admin` / `admin12345`（`/admin/login`）、受限角色 `staff` / `staff12345`、
前台 `user@example.com` / `demo12345`。**这些只在本地** —— `db:seed` 在
`NODE_ENV=production` 下会直接拒绝运行，生产环境用 `pnpm db:bootstrap`。

## 结构与依赖方向

```
apps/web/            React 19 + Vite + Tailwind 4 + React Router + TanStack Query
packages/api/        Hono 路由、鉴权、业务逻辑 —— 不依赖任何托管平台 SDK
packages/db/         Drizzle schema、连接、迁移、种子
packages/shared/     前后端共用的 zod 校验与类型（枚举的唯一定义处）
netlify/ cloudflare/ 薄适配层，把请求转交给 packages/api
scripts/check-*.mjs  五个构建期守卫
docs/patterns/       没有默认装配、但需要时可以照着加的东西
```

依赖只能单向：`web → shared`，`api → db + shared`，`db` 不依赖任何内部包。

**平台能力（目前只有对象存储）走 `packages/api/src/lib/platform.ts` 注入**，
业务包里不出现 `@netlify/*` 或 R2 的类型。`check-platform.mjs` 会挡。
留着 `cloudflare/` 和 `netlify/` 两个入口的意义就在这里 ——
一旦某一家的 SDK 混进业务包，另一个入口立刻编不过。

## 五个守卫：漏了会挂在哪

它们守的都是**漏了不报错、症状要很久才暴露**的约定。挂了先读脚本头部的注释，
它会说清这条规矩存在的理由，通常比改代码绕过去更省事。

| 脚本 | 守什么 | 什么时候会挂 |
| --- | --- | --- |
| `check-archive` | 归档区接全 | 表上加了 `archived_at` 却没进 `ARCHIVE_TYPES` 和 `admin-archive.ts` |
| `check-i18n-keys` | 界面文案 | 少一条中/英文案；或用了没在 `FAMILIES` 里登记的拼接键 |
| `check-error-copy` | 错误文案 | 新错误码没有中英说明（反过来废弃文案也会被指出）|
| `check-platform` | 平台无关 | `packages/api` 里 import 了托管平台的 SDK |
| `check-dark-palette` | 暗色盘完整 | 用了某个颜色档位，但 `index.css` 的暗色块里没重定义它 |

新增守卫的判据：**漏了不报错、症状很久才暴露、靠人复查记不住**，三条都满足才值得写。
「函数不要超过 50 行」这类不符合 —— 它漏了立刻看得见，而且不算错。

## 不可破的约束

- **删除即归档**。各处的删除只打 `archived_at` 标记，物理删除只在归档区、
  只有全权管理员能做。表上加了这对列就必须接进归档区（守卫会挡）。
- **越权返回 404 不是 403** —— 403 等于承认这个 id 存在，是可以被用来试探的。
- **空就是空**，绝不给可空字段塞 `111111111` 这类占位值；所有按可空字段聚合的
  地方显式处理 NULL（`count(distinct coalesce(x, id))`）。
- **不加冗余计数列**，计数一律 SQL 现算 —— 否则多一整类「计数器和明细对不上」的 bug。
- **不加单一 `status` 列**表达多个独立维度。两件独立发生的事就是两个字段，
  硬塞进一个枚举一定会丢信息。
- **全库没有事务**（HTTP 驱动）。并发只有两种正确写法：带条件的 `UPDATE ... WHERE`，
  或**插入后复查再回滚**。「查完再插」不是原子的。
- **金额一律整数分**（字段名 `*_cents`），**时间一律存 UTC**，展示时才格式化。
- **枚举定义在 `packages/shared/src/schemas.ts`** —— 定义在别处 `check-i18n-keys` 查不到。
- **更新用的 zod schema 不能带 `.default()`** —— PATCH 单字段会把其余字段重置成默认值，
  不报错，只是数据悄悄变了。
- **服务端不拼人话**，只给错误码 + `details` + `params`，前端按界面语言翻。
  服务端拼了中文，英文界面上就会冒出一句中文。
- **匿名可调的写接口必须限流**，计数存库不存内存（函数无状态，冷启动即清零）。
- **版本号只改根 `package.json` 一处**。

## 代码风格

- **注释写中文，讲「为什么」不讲「做了什么」**。这个骨架里注释密度偏高是刻意的 ——
  凡是「看起来可以更简单，但不能」的地方都留了理由。`lib/platform.ts`、
  `db/src/client.ts`、`middleware/session.ts` 的头部注释是样板。
  **删注释前先确认那条理由已经不成立。**
- 踩过的坑写进注释或 README 的「几个容易踩的地方」，别只留在 commit message 里。
- 变量和函数名用英文，面向用户的一切文案走 i18n。
- 测试要有牙：写完把实现改坏一次，确认那条测试真的变红。

## 加功能时的检查清单

1. **新表要不要 `archived_at`？** 要 → 必须同时进 `ARCHIVE_TYPES` 和
   `admin-archive.ts`；不要 → 那这张表就不该有 DELETE 接口，用状态列表达生命周期。
2. **枚举定义在 shared**，凡是 `` t(`族名.${取值}`) `` 都要在
   `check-i18n-keys.mjs` 的 `FAMILIES` 里登记。
3. **新接口挂了守卫吗？** 守卫只管「谁能进门」，「进门后看得到哪些行」是每个查询
   自己的责任。需要按归属过滤见 `docs/patterns/multi-tenant.md`。
4. **有并发点吗？** 见上面「全库没有事务」那条。
5. 提交前 `pnpm run ci`。
6. **改了界面就看一眼截图** —— 撑破的栏位、重复的标题这类问题
   typecheck 和测试全绿，只有看图才发现。

## 协作约定

- **不要自作主张 commit 或 push**，改完说清楚改了什么。
- 需要新装依赖时先说一声，说明为什么现有的不够用。
