import { formatCents } from "@app/shared";
import type { Locale } from "../i18n/index.js";

/**
 * 站点时区。**所有时间一律存 UTC，只在这一层按站点时区格式化。**
 *
 * 有夏令时的地区尤其不能存本地时间字符串 —— 切换那天会直接出错，
 * 而且是一年只错两次、事后很难复现的那种。换项目时改这一个常量。
 */
const TIME_ZONE = "Pacific/Auckland";

export function money(cents: number, locale: Locale): string {
  return formatCents(cents, locale === "zh" ? "zh-Hans-NZ" : "en-NZ");
}

/**
 * 只到日期，不带时分。
 *
 * 列表里一行要塞下取货码、姓名、电话、数量、金额和状态，
 * 时分在这种密度下既占地方又没人看 —— 需要精确到分钟的场合
 * （对账、纠纷）本来就要点进详情。
 */
export function dateOnly(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-Hans-NZ" : "en-NZ", {
    timeZone: TIME_ZONE,
    dateStyle: "short",
  }).format(new Date(iso));
}

export function dateTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-Hans-NZ" : "en-NZ", {
    timeZone: TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

/**
 * 英文字段为空时回退中文，管理员就不必每条内容都录两遍。
 */
export function localizedText(
  zhText: string,
  enText: string | null | undefined,
  locale: Locale,
): string {
  if (locale === "en" && enText && enText.trim()) return enText;
  return zhText;
}

/**
 * 可空字段的显示。
 *
 * 显示成一句「未填写」而不是留白：留白在一行 `姓名 · 电话` 里
 * 会变成一个孤零零的间隔号，看着像是渲染坏了，而不像「这里本来就没有」。
 *
 * 配套的原则见 docs/design.md「空就是空」：**绝不给可空字段塞占位值**，
 * 占位值和真值长得一模一样，会让统计静默算错。
 */
export function contactOr(value: string | null, fallback: string): string {
  return value?.trim() ? value : fallback;
}

/** 把 UTC 的 ISO 字符串转成 <input type="datetime-local"> 需要的本地时间格式 */
export function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
