import { z } from "zod";

/**
 * 枚举一律定义在这个文件里。
 *
 * 不是风格洁癖：`scripts/check-i18n-keys.mjs` 读的是**这个文件的源码**，
 * 用它来核对 `` t(`族名.${取值}`) `` 这类拼接键的每个取值都有中英文案。
 * 枚举定义在别处，那个守卫就查不到，往枚举里加一个取值而忘了补文案
 * 会一路漏到界面上显示原始键名。
 */

export const ADMIN_ROLES = ["admin", "staff"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const LOCALES = ["zh", "en"] as const;
export type Locale = (typeof LOCALES)[number];

/**
 * 归档区里的各类对象。
 *
 * 「删除」在这套骨架里统一是「移入归档」，物理删除只在归档区里发生。
 * 这个枚举是归档接口的路径参数，也是前端分区展示的依据。
 *
 * **凡是表上有 archived_at 的实体都必须列进来**，否则它被「删除」之后
 * 就从所有界面上消失且再也恢复不了 —— 归档区列不出它，也就没有入口。
 * `scripts/check-archive.mjs` 守着这一点，刻意物理删除的实体写进那个脚本的
 * `PHYSICAL_DELETE` 并说明理由。
 */
export const ARCHIVE_TYPES = ["account", "user"] as const;
export type ArchiveType = (typeof ARCHIVE_TYPES)[number];

export const localeSchema = z.enum(LOCALES);

// ---------- 登录与账号 ----------

/**
 * 用户名。不允许含 @ —— 登录时靠有没有 @ 区分「这是邮箱还是用户名」，
 * 用户名里放 @ 会让这个判断失效，出现一个输入同时像两种标识的歧义。
 * 只允许字母数字加下划线连字符，也顺便挡掉了纯空格之类的怪名字。
 */
export const usernameSchema = z
  .string()
  .trim()
  .min(3, "用户名至少 3 位")
  .max(30, "用户名最多 30 位")
  .regex(/^[a-zA-Z0-9_-]+$/, "用户名只能包含字母、数字、下划线和连字符");

export const passwordSchema = z.string().min(8, "密码至少 8 位").max(200);

/**
 * 手机号。这里只做最松的形状校验，不按某个国家的规则收紧 ——
 * 收紧的代价是真实存在的号码被拒，而这类拒绝用户没有任何办法绕过。
 */
export const phoneSchema = z
  .string()
  .trim()
  .min(6, "手机号至少 6 位")
  .max(20, "手机号最多 20 位")
  .regex(/^[0-9+\-\s()]+$/, "手机号只能包含数字和 + - ( ) 空格");

export const loginSchema = z
  .object({
    /** 邮箱或用户名，服务端按有没有 @ 判断 */
    identifier: z.string().trim().min(1, "请填写邮箱或用户名").max(200),
    password: z.string().min(1, "请填写密码").max(200),
  })
  .strict();

export const registerSchema = z
  .object({
    email: z.email("邮箱格式不正确").max(200),
    username: usernameSchema,
    password: passwordSchema,
    name: z.string().trim().min(1, "请填写姓名").max(60),
    phone: phoneSchema.optional().or(z.literal("")),
    preferredLocale: localeSchema.default("zh"),
  })
  .strict();

/**
 * 改资料。都可选，只改传来的那几项。
 *
 * **邮箱和用户名刻意不在这里** —— 它们是登录标识，改了要处理唯一性冲突
 * 和验证流程，而验证要发信。等真的需要时单独做一条路径，
 * 不要顺手混进「改个昵称」的接口里。
 *
 * phone 允许传空串，服务端把它转成 NULL —— 「空就是空」，
 * 不能留一个空字符串在库里，那会让「有没有留电话」的判断变成两种写法。
 */
export const profileUpdateSchema = z
  .object({
    name: z.string().trim().min(1, "请填写姓名").max(60),
    phone: phoneSchema.or(z.literal("")),
    preferredLocale: localeSchema,
  })
  .partial()
  .strict();

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, "请填写当前密码").max(200),
    newPassword: passwordSchema,
  })
  .strict();

export const adminLoginSchema = z
  .object({
    username: z.string().trim().min(1, "请填写用户名").max(60),
    password: z.string().min(1, "请填写密码").max(200),
  })
  .strict();

const adminShape = {
  username: usernameSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1, "请填写显示名").max(60),
  role: z.enum(ADMIN_ROLES),
  disabled: z.boolean(),
};

/**
 * 建号只取这几个字段。刻意不整组展开 adminShape ——
 * 那样会把只用于更新的 disabled 也变成建号时的必填项。
 */
export const adminCreateSchema = z
  .object({
    username: adminShape.username,
    password: adminShape.password,
    displayName: adminShape.displayName,
    role: adminShape.role.default("staff"),
  })
  .strict();

/**
 * 改号。**注意这里是从 adminShape 单独构造的，不是 adminCreateSchema.partial()。**
 *
 * 更新用的 schema 绝不能带 `.default()`：带了的话，PATCH 只提交一个字段时
 * 其余字段会被默认值填充并写回数据库，表现为「改了个显示名，角色被重置成 staff」。
 * 这类 bug 不报错、不触发任何校验失败，只是数据悄悄变了。
 */
export const adminUpdateSchema = z
  .object({
    password: adminShape.password,
    displayName: adminShape.displayName,
    role: adminShape.role,
    disabled: adminShape.disabled,
  })
  .partial()
  .strict();

// ---------- 站点设置 ----------

/**
 * 站点设置的形状与默认值。
 *
 * 加一个设置项只要在这里加一行，不用跑迁移 —— 数据库那边是键值表，
 * 缺键不是错误，是「还没改过」。
 *
 * 什么该放这里、什么该放环境变量，判据是**改它的成本**：
 * 纯文案、随时能改、改完立刻生效的放这里；改了还要动 DNS、
 * 换密钥、重新部署的放环境变量（如发件地址和 API key）。
 */
export const siteSettingsSchema = z
  .object({
    siteName: z.string().trim().max(60).default("Starter"),
    siteNameEn: z.string().trim().max(60).default(""),
    /** 首页横幅。留空则用界面自带的默认文案，这样刚装好的站不会顶着两行空白 */
    heroTitle: z.string().trim().max(60).default(""),
    heroTitleEn: z.string().trim().max(60).default(""),
    heroText: z.string().trim().max(200).default(""),
    heroTextEn: z.string().trim().max(200).default(""),
    /**
     * 发件人显示名，收件箱里看到的那个名字。
     *
     * 发件**地址**不在这里 —— 改地址必须同时在邮件服务商那边验证新域名的 DNS，
     * 不是后台点一下能完成的事，所以它跟 API key 一起放环境变量。
     */
    emailFromName: z.string().trim().max(60).default("Starter"),
    /** 回复地址。留空则回复会进发件地址那个不看的信箱 */
    emailReplyTo: z.string().trim().max(200).default(""),
  })
  .strict();

export type SiteSettings = z.infer<typeof siteSettingsSchema>;

/** 后台改设置：只提交动过的项 */
export const siteSettingsUpdateSchema = siteSettingsSchema.partial();
export type SiteSettingsUpdate = z.infer<typeof siteSettingsUpdateSchema>;

export const SITE_SETTINGS_DEFAULTS: SiteSettings = siteSettingsSchema.parse({});

/** 发测试邮件时只要一个收件地址 */
export const testEmailSchema = z.object({ to: z.email("请填写合法的邮箱地址") }).strict();

// ---------- 分页 ----------

/**
 * 列表接口统一的分页参数。
 *
 * **上限不是随便定的**：Serverless 函数的同步响应通常有硬上限
 * （Netlify 约 6MB），不设上限的话，一张表长到几万行就会把响应撑爆，
 * 函数直接 502。按每条记录 500 字节估，200 条约 100KB，余量充足。
 *
 * 注意本地 dev server 一般**不执行**这个限制，所以这类问题在本地永远测不出来。
 */
export const MAX_PAGE_SIZE = 200;
export const DEFAULT_PAGE_SIZE = 50;

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).default(0),
});
export type Pagination = z.infer<typeof paginationSchema>;

/**
 * 前台列表每次加载几个。
 *
 * 比后台小得多，因为卡片带图、一屏放不下几张。挑一个**能被列数整除**的数
 * （前台常见 1 列或 2 列）：加载边界上留半行空位很显眼，看着像坏了。
 */
export const PUBLIC_PAGE_SIZE = 12;
