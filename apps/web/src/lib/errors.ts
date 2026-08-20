import type { TFunction } from "i18next";
import { ApiRequestError } from "./apiClient.js";

/**
 * 把任何一个失败翻成人能照着做的话。
 *
 * 原则是：**永远不要只说「出错了」**。用户提交没成功时，要么告诉他哪个字段不对、
 * 怎么改；要么告诉他这是网络问题、权限问题还是服务端问题。实在认不出来的错误，
 * 也要把错误码和状态码带出来 —— 那样至少他截个图我们能查，
 * 而「出错了，请稍后重试」谁也查不了。
 */
export type DescribedError = {
  /** 顶部错误框里的那句话 */
  message: string;
  /** 逐字段的错误，key 是表单字段名。没有字段级信息时为空对象 */
  fields: Record<string, string>;
  /**
   * 原始错误码，页面可以据此把整句挂到某个输入框上 ——
   * 比如注册页把 email_taken 显示在邮箱那一栏下面，而不是只在表单底部说一句。
   */
  code: string | null;
};

/** zod 报上来的一条问题。只列我们用得上的字段 */
type ZodIssue = {
  code?: string;
  path?: (string | number)[];
  message?: string;
  minimum?: number;
  maximum?: number;
  origin?: string;
  expected?: string;
  format?: string;
  keys?: string[];
};

/**
 * 把一条 zod 问题翻成中/英文。
 *
 * 刻意不直接用 issue.message：那是 schema 里写死的中文，英文界面上会串味。
 * 按 code 重新组织，翻不出来时才退回服务端原文 —— 原文再差也好过一句「出错了」。
 */
function describeIssue(issue: ZodIssue, t: TFunction): string {
  const { code, origin, minimum, maximum } = issue;
  const isText = origin === "string" || origin === undefined;

  if (code === "too_small") {
    if (isText) {
      return minimum !== undefined && minimum <= 1
        ? t("error.field.required")
        : t("error.field.tooShort", { min: minimum });
    }
    return t("error.field.tooSmall", { min: minimum });
  }

  if (code === "too_big") {
    return isText
      ? t("error.field.tooLong", { max: maximum })
      : t("error.field.tooBig", { max: maximum });
  }

  /**
   * 少填一个必填项时 zod 报的就是 invalid_type。真正的类型不匹配
   * （比如数字字段收到字符串）只可能是前端自己传错了，那是 bug 不是用户的错，
   * 所以这里统一按「此项必填」说 —— 对用户而言这是唯一能照着做的解释。
   */
  if (code === "invalid_type") return t("error.field.required");

  if (code === "invalid_format" || code === "invalid_string") {
    if (issue.format === "email") return t("error.field.email");
    if (issue.format === "datetime") return t("error.field.datetime");
    return t("error.field.format");
  }

  if (code === "invalid_value" || code === "invalid_enum_value") return t("error.field.oneOf");
  if (code === "unrecognized_keys") return t("error.field.unexpected");

  return issue.message || t("error.field.format");
}

/** 字段名 → 界面上的叫法。翻不到就退回原始字段名，总比不说是哪个字段强 */
function fieldLabel(field: string, t: TFunction): string {
  const key = `error.fieldName.${field}`;
  const label = t(key);
  return label === key ? field : label;
}

/**
 * fetch 在网络层失败时抛的是 TypeError，不是我们的 ApiRequestError。
 * 这种情况要说「网络连不上」而不是「服务器出错」—— 两者的下一步动作完全不同。
 */
function isNetworkFailure(err: unknown): boolean {
  return err instanceof TypeError || (err instanceof Error && err.name === "AbortError");
}

export function describeError(err: unknown, t: TFunction): DescribedError {
  if (isNetworkFailure(err)) {
    return { message: t("error.network"), fields: {}, code: "network" };
  }

  if (!(err instanceof ApiRequestError)) {
    // 兜底也要带上原始信息，不要把线索吃掉
    const detail = err instanceof Error && err.message ? err.message : String(err ?? "");
    return {
      message: detail ? t("error.unexpectedWith", { detail }) : t("error.unexpected"),
      fields: {},
      code: null,
    };
  }

  // 字段级校验失败：把每条问题挂到对应的输入框上，顶部再给一句摘要
  if (err.code === "invalid_input" && Array.isArray(err.details)) {
    const issues = err.details as ZodIssue[];
    const fields: Record<string, string> = {};

    for (const issue of issues) {
      const field = issue.path?.[0];
      if (typeof field !== "string") continue;
      // 同一字段多条问题时保留第一条，输入框下面挂一句就够了
      if (!(field in fields)) fields[field] = describeIssue(issue, t);
    }

    const names = Object.keys(fields).map((f) => fieldLabel(f, t));
    // 分隔符也得跟着语言走：中文用顿号，英文用逗号加空格
    const message = names.length
      ? t("error.invalidFields", { fields: names.join(t("error.listSeparator")) })
      : t("error.code.invalid_input");

    return { message, fields, code: err.code };
  }

  /**
   * 按错误码取文案。取不到时把码和 HTTP 状态一起显示出来 ——
   * 用户看不懂 `partner_has_data` 没关系，他截图给我们就能立刻定位，
   * 这比一句「出错了」有用得多。
   */
  const key = `error.code.${err.code}`;
  const translated = t(key, err.params ?? {});
  if (translated !== key) return { message: translated, fields: {}, code: err.code };

  // 没有对应文案时优先用服务端给的原文，再不行才拼错误码
  const fallback = err.serverMessage
    ? err.serverMessage
    : t("error.unknownCode", { code: err.code, status: err.status });

  return { message: fallback, fields: {}, code: err.code };
}

/** 只要那句话的场景（列表加载失败之类，没有表单字段） */
export function errorMessageOf(err: unknown, t: TFunction): string {
  return describeError(err, t).message;
}
