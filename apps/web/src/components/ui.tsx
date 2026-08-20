import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { ArrowLeftIcon } from "./Icons.js";

export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="text-2xl font-semibold text-gray-900">{children}</h1>;
}

export function Card({
  children,
  className = "",
  dense = false,
}: {
  children: ReactNode;
  className?: string;
  /**
   * 更紧的内边距，给一屏要放很多张的列表用。
   *
   * **做成一个显式的档位，而不是让调用方传 `className="p-4"`。**
   * p-4 和 p-5 是同一个属性，谁赢取决于生成的样式表顺序而不是这里的
   * 书写顺序 —— 实测 p-5 会赢，而那种失效不报错，只是看起来「没生效」。
   * 同样的坑在 w-32 / w-full 上踩过一次。
   */
  dense?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-gray-200 bg-white shadow-sm ${
        dense ? "p-3.5" : "p-5"
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      {children}
      {error && <span className="mt-1 block text-sm text-red-600">{error}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900";

/**
 * 按钮的配色按**后果严重程度**分四档，不按视觉重要性分。
 *
 * 一排按钮长得一样时，「编辑」和「给三十个人群发邮件」看起来是同一件事，
 * 而后者发出去收不回来。颜色在这里的作用不是好看，是在手指落下之前
 * 多给半秒钟的犹豫。
 *
 * | 档 | 后果 | 例子 |
 * |---|---|---|
 * | `ghost` | 没有副作用，随时可回头 | 编辑、查看 |
 * | `primary` | 改变用户看到的东西，可撤销 | 发布、保存 |
 * | `warn` | **对外发出，收不回来** | 通知可取货（群发邮件） |
 * | `danger` | 破坏性，需要二次确认 | 删除 |
 *
 * 琥珀和红的语义和站内其他地方一致：琥珀 = 需要注意，红 = 危险或已取消。
 */
export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "warn" | "danger";
  /** sm 给一行要放好几个的列表用，省横向也省纵向 */
  size?: "sm" | "md";
}) {
  const styles = {
    primary: "bg-gray-900 text-white hover:bg-gray-700 disabled:bg-gray-400",
    ghost: "border border-gray-300 text-gray-700 hover:bg-gray-50",
    warn: "border border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100",
    danger: "border border-red-300 text-red-700 hover:bg-red-50",
  }[variant];

  const sizing = size === "sm" ? "px-3 py-1.5 text-sm" : "px-4 py-2 text-sm";

  return (
    <button
      className={`rounded-lg font-medium transition-colors disabled:cursor-not-allowed ${sizing} ${styles} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Loading() {
  const { t } = useTranslation();
  return <p className="py-8 text-center text-sm text-gray-400">{t("common.loading")}</p>;
}

/**
 * 页首的返回链接。
 *
 * 抽出来是因为好几处详情页的写法一字不差，
 * 而现在多了个图标要对齐，再抄三遍就是三个会各自跑偏的地方。
 *
 * **箭头是装饰，`aria-hidden`**（在 Icons.tsx 里统一设了）：
 * 链接的意思由旁边的文字说清楚，读屏念一遍「返回」就够了。
 *
 * `pointer-coarse:` 那一档是给手指用的：index.css 里的 44px 规则
 * 刻意不碰 `<a>`（改行内元素的 display 会把块级导航挤成两列，
 * 那边写了原委），所以链接的可点区域要在组件里按需要加。
 */
export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 pointer-coarse:py-2"
    >
      <ArrowLeftIcon className="size-4" />
      {label}
    </Link>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </p>
  );
}

export function StatusBadge({ label, tone }: { label: string; tone: "gray" | "green" | "amber" | "red" }) {
  const tones = {
    gray: "bg-gray-100 text-gray-700",
    green: "bg-green-100 text-green-700",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-700",
  }[tone];
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tones}`}>{label}</span>;
}
