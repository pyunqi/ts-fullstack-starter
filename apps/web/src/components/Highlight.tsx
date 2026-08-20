import type { ReactNode } from "react";

/** 正则元字符要转义 —— 员工搜的内容里出现 `+` 或 `(` 是常事（`+64`、`(09)`） */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 把命中的那一段标出来。
 *
 * 典型场景是：照着用户报的尾号搜索，然后要在一行字里
 * 确认「对上了没有」。不标的话，那几位数字混在一串号码中间，
 * 得一位一位对 —— 而现场是有人排队等着的。
 *
 * `terms` 可以给多个：手机号搜索会同时用原样和归一化后的形态匹配
 * （见 buildOrderFilter），两种都要能标上。
 */
export function Highlight({ text, terms }: { text: string; terms: (string | undefined)[] }) {
  const valid = terms
    .map((t) => t?.trim())
    .filter((t): t is string => Boolean(t))
    // 长的先匹配：`0219123456` 和 `9123456` 同时命中时，标长的那段更有用
    .sort((a, b) => b.length - a.length);

  if (valid.length === 0) return <>{text}</>;

  const pattern = new RegExp(`(${valid.map(escapeRegex).join("|")})`, "gi");
  const parts = text.split(pattern);

  const out: ReactNode[] = [];
  for (const [i, part] of parts.entries()) {
    if (!part) continue;
    // split 带捕获组时，奇数下标就是命中的那一段
    if (i % 2 === 1) {
      out.push(
        <mark key={i} className="rounded bg-amber-200 px-0.5 text-gray-900">
          {part}
        </mark>,
      );
    } else {
      out.push(part);
    }
  }

  return <>{out}</>;
}
