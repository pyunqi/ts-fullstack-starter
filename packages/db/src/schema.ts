import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";

const uuid = () => crypto.randomUUID();

/** 所有时间统一存 UTC 时间戳，展示层再按站点时区格式化 */
const createdAt = () =>
  integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`);

const updatedAt = () =>
  integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`)
    .$onUpdate(() => new Date());

/**
 * 归档字段。所有「可以被删除」的表共用这一对列。
 *
 * 「删除」在这套骨架里只有一个含义：把行标成已归档，从所有日常列表里消失，
 * 但数据仍在。真正的物理删除只在归档区里发生，是一个单独的、显式的动作。
 * 这样误删可以原样恢复，而级联删除这种不可逆的事，
 * 不会因为点错一个按钮就发生。
 *
 * 所有列表、聚合、鉴权查询都必须带上 archived_at IS NULL —— 漏一处，
 * 归档过的数据就会从那个口子漏回界面上。集中的过滤条件放在
 * packages/api/src/lib/archive.ts。
 *
 * 加了这对列，就必须同时把这张表接进 ARCHIVE_TYPES 和 routes/admin-archive.ts，
 * 否则它被「删除」之后归档区列不出来，也就没有恢复入口 ——
 * 从用户角度看和物理删除没区别，而界面上还写着「可以恢复」。
 * scripts/check-archive.mjs 守着这一点。
 */
const archivedAt = () => integer("archived_at", { mode: "timestamp" });

/** 归档操作人，用 set null：账号被清理掉不该让归档记录跟着消失 */
const archivedBy = () =>
  text("archived_by").references((): AnySQLiteColumn => admins.id, { onDelete: "set null" });

/**
 * 后台角色。
 *
 * 骨架只给两档，够表达「全权」和「受限」这条最基本的分界。
 * 需要多租户（每个账号只看得到自己那份数据）的项目，
 * 见 docs/patterns/multi-tenant.md —— 那份文档里有完整的 Scope 实现，
 * 照着加一个 partner_id 轴即可，不要在这里塞第三个角色来凑。
 */
export const ADMIN_ROLES = ["admin", "staff"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const LOCALES = ["zh", "en"] as const;
export type Locale = (typeof LOCALES)[number];

/**
 * 后台账号。与前台用户是**完全独立的两张表、两种会话**。
 *
 * 合成一张表的诱惑很大（少一半代码），但两者的风险等级差太远：
 * 后台账号看得到全部用户的个人信息，前台账号只能看自己那份。
 * 合表意味着一次权限判断失误就跨越了这条界线。
 */
export const admins = sqliteTable(
  "admins",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name").notNull(),
    role: text("role", { enum: ADMIN_ROLES }).notNull().default("admin"),
    /**
     * 停用：账号还在，只是登不进来。和归档是两件事 ——
     * 停用是日常操作（离职、临时禁用），账号仍留在列表里；
     * 归档是「删除」，账号从列表消失，进归档区。两者都会挡住登录。
     */
    disabledAt: integer("disabled_at", { mode: "timestamp" }),
    /** 见 users.sessionsValidFrom 的说明，两边同一套做法 */
    sessionsValidFrom: integer("sessions_valid_from", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`0`),
    archivedAt: archivedAt(),
    archivedBy: archivedBy(),
    createdAt: createdAt(),
    lastLoginAt: integer("last_login_at", { mode: "timestamp" }),
  },
  (t) => [uniqueIndex("admins_username_unique").on(t.username)],
);

/** 前台用户 */
export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    email: text("email").notNull(),
    /** 第二个登录标识，与 email 二选一即可登录 */
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    /**
     * 显示名。**刻意不唯一、不能当登录标识** —— 显示名往往同时是联系人姓名，
     * 两个用户同名完全正常，拿它登录会出现「该验证哪个账号的密码」的身份歧义。
     */
    name: text("name").notNull(),
    phone: text("phone"),
    preferredLocale: text("preferred_locale", { enum: LOCALES }).notNull().default("zh"),
    /**
     * 会话有效起点。改密码时推到当前时间，让此前签发的所有 token 立刻失效。
     *
     * JWT 是无状态的，没有这一列就**没有任何吊销手段** —— 改了密码，
     * 旧设备上的会话照样能用满 7 天。而「我怀疑密码泄露了所以改密码」
     * 恰恰是最需要踢掉其他设备的场景，那时候不能踢等于没改。
     *
     * 存**毫秒**，比对的是 token 里我们自己写的 iatMs 声明。
     * 刻意不用 JWT 标准的 iat —— 那个只精确到秒，而改密码和重发会话
     * 必然落在同一秒里，秒级精度下「改之前」和「改之后」区分不开，
     * 结果就是谁都踢不掉。两边都是自己的代码，没有理由迁就秒。
     *
     * 默认 0（= 从未失效过），而不是建表时间：后者会在迁移那一刻
     * 把所有已登录的用户一次性踢下线，没必要。
     */
    sessionsValidFrom: integer("sessions_valid_from", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`0`),
    archivedAt: archivedAt(),
    archivedBy: archivedBy(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("users_email_unique").on(t.email),
    uniqueIndex("users_username_unique").on(t.username),
  ],
);

/**
 * 登录尝试记录，用来限流。
 *
 * 存库而不是放进程内存：函数是无状态的，每次冷启动内存计数就清零，
 * 而攻击方只要不断触发新实例就能绕过 —— 那种限流看着有，实际没有。
 *
 * 只记失败：成功登录不该给自己攒下一次锁定。旧记录靠 at 上的索引定期清掉。
 */
export const loginAttempts = sqliteTable(
  "login_attempts",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    /** 登录标识（用户名或邮箱），统一转小写后存，避免大小写绕过 */
    identifier: text("identifier").notNull(),
    ip: text("ip"),
    at: createdAt(),
  },
  (t) => [
    index("login_attempts_identifier_idx").on(t.identifier, t.at),
    index("login_attempts_ip_idx").on(t.ip, t.at),
  ],
);

/**
 * 通用的限流计数，给登录之外的接口用（注册、以及任何匿名可调的写接口）。
 *
 * 和 login_attempts 分开而不是共用一张表：那张表的语义是「失败的登录尝试」，
 * 往里塞用户手机号会把两种保留期限、两种含义混在一起 ——
 * 而且 identifier 这个列名下装的将是用户 PII，翻表的人会误解。
 *
 * 与 login_attempts 的另一个关键区别：**这里记的是每一次尝试，不只是失败**。
 * 匿名写接口成功执行才是要限的那件事。
 */
export const rateEvents = sqliteTable(
  "rate_events",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    /** 哪一类动作，如 register。同一个 key 在不同 bucket 下互不影响 */
    bucket: text("bucket").notNull(),
    /** 计数依据：IP，或者手机号这类调用方自称的标识 */
    key: text("key").notNull(),
    at: createdAt(),
  },
  (t) => [index("rate_events_lookup_idx").on(t.bucket, t.key, t.at)],
);

/**
 * 审计日志：谁在什么时候做了什么。
 *
 * 只记「改变了什么」的动作，不记读取 —— 全量记录读操作在这个体量下
 * 只会让日志被列表请求淹没，真出事时反而翻不到关键那几行。
 *
 * 操作人信息在写入时快照一份（名字、角色），不做外键：
 * 账号被彻底删除之后，日志仍然要能说清当时是谁干的。
 */
export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    at: createdAt(),
    /** 形如 admin.archive、auth.login.failed，前缀就是对象类型 */
    action: text("action").notNull(),
    actorId: text("actor_id"),
    actorName: text("actor_name"),
    actorRole: text("actor_role"),
    targetType: text("target_type"),
    targetId: text("target_id"),
    /** 一句人话的摘要，直接显示在日志页上 */
    summary: text("summary"),
    ip: text("ip"),
  },
  (t) => [index("audit_logs_at_idx").on(t.at), index("audit_logs_action_idx").on(t.action)],
);

/**
 * 站点设置。键值表，一行一个设置项。
 *
 * 做成键值而不是「一行多列的单例表」：加一个设置项不用改表结构，
 * 也就不用为了一句文案跑一次迁移。代价是值统一按文本存（JSON 编码），
 * 类型和默认值由 packages/shared 那一层定义和兜底 ——
 * 数据库里没有的键不是错误，就是「还没改过，用默认值」。
 */
export const siteSettings = sqliteTable("site_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: updatedAt(),
  updatedBy: text("updated_by").references((): AnySQLiteColumn => admins.id, {
    onDelete: "set null",
  }),
});

/**
 * 上传的图片。
 *
 * 数据库只存元信息，字节流在对象存储里（见 lib/platform.ts）。
 * **删记录时必须显式删对象存储里的对象** —— 数据库的级联删除管不到它，
 * 而且要在删行**之前**把 key 查出来，行没了就再也不知道该删哪些 key。
 */
export const images = sqliteTable(
  "images",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    /** 对象存储里的 key */
    blobKey: text("blob_key").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    /**
     * 谁传的。**restrict 而不是 set null** —— 传图的人被彻底删除时，
     * 「这张图是谁传的」这条轨迹会跟着断掉，而图还挂在页面上。
     *
     * 代价是这类账号在归档区里删不掉，归档区会把原因直接标出来
     * （见 routes/admin-archive.ts）。这是刻意的：先想清楚那些图怎么处理，
     * 再决定删不删人。
     */
    uploadedBy: text("uploaded_by").references((): AnySQLiteColumn => admins.id, {
      onDelete: "restrict",
    }),
    createdAt: createdAt(),
  },
  (t) => [index("images_created_idx").on(t.createdAt)],
);
