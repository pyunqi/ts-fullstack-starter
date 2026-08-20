/**
 * 金额一律以**整数分**在数据库和 API 里传递，只有展示层才转成带小数点的字符串。
 *
 * 理由是 SQLite 没有 DECIMAL，用浮点存钱会有精度问题 ——
 * 而且那种误差不会报错，只会在对账时差几分钱，查起来极其费时。
 * 字段名统一带 `_cents` 后缀，让「这是分不是元」在读代码时就看得见。
 */
export const CURRENCY = "NZD" as const;

/**
 * 货币符号刻意手写，不用 Intl 的 currency 样式。
 *
 * Intl 在很多语言环境下会把货币渲染成裸的 `$`，对双语站点有歧义
 * （中文用户容易读成人民币或美元）。写死一个带国别的符号更清楚。
 * 换币种时改这两个常量即可。
 */
export const CURRENCY_SYMBOL = "NZ$" as const;

export function formatCents(cents: number, locale: string = "en-NZ"): string {
  const amount = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(cents) / 100);

  return `${cents < 0 ? "-" : ""}${CURRENCY_SYMBOL}${amount}`;
}

/** 把用户输入的元金额（如 "12.50"）转成整数分，非法输入返回 null */
export function parseAmountToCents(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  return Math.round(Number(trimmed) * 100);
}
