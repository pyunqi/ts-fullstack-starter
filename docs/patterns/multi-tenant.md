# 多租户：每个账号只看得到自己那份数据

**骨架里刻意没有装这套。** 单租户项目要先花半天把它删干净，
那比从零加还慢。需要的时候照着这份文档加，大约两小时。

这里记的不是「怎么写一个 where 条件」——那是最简单的部分。
记的是**它会从哪里漏**，以及怎么让漏掉的地方在构建期就挂掉。

---

## 一、只在一处记录归属

先定一条链，让每个对象的归属都能从链上推出来：

```
tenants（租户）
   ↑ tenant_id (NULL = 平台自营)
resources（主对象）
   ↑ resource_id
records（从属对象）
```

**只有主对象上有 `tenant_id`。** 从属对象的归属顺着链推，没有第二处记录 ——
否则会出现「订单的归属和它所属商品的归属对不上」这种状态，
而那种不一致一旦出现，任何一边的过滤都会漏。

例外是账号表：`admins.tenant_id` 独立于对象链（一个员工不属于任何一件商品）。

**`NULL` 表示平台自营，不要在租户表里给自己占一行。** 占一行的话，
每处查询都得先知道那一行的 id，而它一旦被误删或下架，自营数据会集体消失。

## 二、Scope 是查询的第一个参数，不是可选项

```ts
export type Scope =
  | { kind: "platform" }              // 全站可见
  | { kind: "public" }                // 前台，不按归属过滤
  | { kind: "tenant"; tenantId: string | null };

export const PLATFORM_SCOPE: Scope = { kind: "platform" };
export const PUBLIC_SCOPE: Scope = { kind: "public" };

export function scopeOf(c: Context<AppEnv>): Scope {
  // 先看 role 再看 tenantId —— 平台管理员的 tenant_id 同样是 NULL，
  // 只看那一个字段会把「平台管理员」和「自营员工」混成同一种人
  if (c.get("adminRole") === "admin") return PLATFORM_SCOPE;
  return { kind: "tenant", tenantId: c.get("adminTenantId") ?? null };
}

export function tenantFilter(scope: Scope, column: AnySQLiteColumn): SQL | undefined {
  if (scope.kind !== "tenant") return undefined;
  return scope.tenantId === null ? isNull(column) : eq(column, scope.tenantId);
}
```

关键在**签名**：

```ts
selectResources(scope: Scope, where?: SQL)   // 第一个参数，不给默认值
```

前台要显式传 `PUBLIC_SCOPE`。「不按归属过滤」是一个决定，得写出来 ——
写成默认值的话，将来某个新接口漏掉作用域会**静默变成返回全站数据**。

三种取值都显式列出来也是同样的道理：没有 `undefined` 这个中间态，
就不存在「忘了传」这种可能。

## 三、构建期把绕过去的写法拦下来

类型只能管住走 `selectResources` 的那条路。路由文件里随手写一句
`db.select().from(resources)` 就绕过去了 —— 不报错、不崩，
只是安静地返回全站数据，通常要等租户反馈「我看到别人的数据」才发现。

所以加一个守卫，禁止路由层直接读带归属的表：

```js
// scripts/check-scope.mjs
const SCOPED_TABLES = ["resources", "records"];
const WAIVER = /scope-ok:/;
```

确实需要绕开的地方（比如归档区专查已归档行）写一行
`// scope-ok: 为什么这里不需要作用域` 放行，
**让每一次例外都是有名有姓的决定，而不是无声的疏忽。**

扫描的骨架（照着 `scripts/check-archive.mjs` 的文件读法写）：

```js
lines.forEach((line, index) => {
  // 只查读取：按 id 的增删改另有归属校验把关
  if (!/\bdb\s*$|\bdb\s*\.\s*select\s*\(/.test(line)) return;

  /**
   * 取到**本条语句结束为止**，而不是固定往下看几行 ——
   * 固定窗口会越过语句边界，把下一个函数里的 .from() 算到这条头上，
   * 于是一条 db.update(...) 被报成「读了资源表」。
   */
  const end = lines.findIndex((l, i) => i >= index && l.trimEnd().endsWith(";"));
  const statement = lines.slice(index, (end === -1 ? index : end) + 1).join("\n");
  const from = statement.match(/\.from\(\s*([A-Za-z_$][\w$]*)/);
  if (!from || !SCOPED_TABLES.includes(from[1])) return;

  // 放行标记：本行、或上方注释块里出现过就算
  const context = lines.slice(Math.max(0, index - 12), index + 1).join("\n");
  if (WAIVER.test(context) || WAIVER.test(statement.slice(0, 200))) return;

  problems.push(`${file}:${index + 1} 直接读了 ${from[1]}`);
});
```

> ⚠️ 这个守卫只认你列进 `SCOPED_TABLES` 的表。**新表默认是不设防的**，
> 而漏了的症状是安静地返回全站数据。加带归属的新表时，记得手动加进去。

## 四、越权返回 404，不是 403

403 等于承认「这个 id 确实存在，只是不属于你」。
租户之间不该能靠试 id 互相探测对方有多少数据。

这条要贯彻到每一个按 id 取数据的接口，包括图片、文件、导出。

## 五、测试要用「三方剧本」

隔离测试要证明的是「甲看不到乙的，也看不到自营的」，
所以 fixtures 里每一方都必须**各有一份同类数据**：

```
平台自营 / 租户甲 / 租户乙，各建一份资源和一条从属记录
```

只建一方的话，接口返回空看着也像通过了 —— 而那正是最危险的假绿。

然后逐个接口断言：用甲的会话去够自营和乙的数据，全部 404。
接口有几个就写几条，不要图省事只测一两个 ——
这类测试的价值在于**以后有人加接口时会挂**。

## 六、会漏的地方（清单）

按实际踩到的顺序：

1. **新接口忘了传 Scope** —— 靠类型签名和 `check-scope.mjs` 挡
2. **新表忘了加进 `SCOPED_TABLES`** —— 守卫认不出来，默认不设防
3. **聚合查询**（统计、计数）—— 最容易漏，因为它不返回行，
   看不出「多算了别人的」
4. **私密文件的读取路由** —— 鉴权挂了，但忘了校验归属
5. **审计日志** —— 跨所有租户，切一份给租户看的时候容易漏字段
6. **归档区** —— 恢复和物理删除也要校验归属，
   否则甲能恢复乙删掉的东西
7. **登录时的账号有效性检查** —— 租户被删之后它的账号不该还能登进来，
   而账号自己没有被归档，光查 admins 表看不出这一点

## 七、role 和 tenant_id 是两条正交的轴

```
role       能做什么      admin / tenant_owner / staff
tenant_id  能看到谁的    NULL（平台自营）/ 某个租户 id
```

看权限必须两个一起看。守卫（middleware）只管第一条轴 ——「谁能进门」；
第二条轴是每个查询自己的责任 ——「进门后看得到哪些行」。

**两件事刻意分开**，才不会出现「把菜单藏了就以为安全了」这种误判。
