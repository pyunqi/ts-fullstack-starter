import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { THEMES, setTheme, useTheme, type Theme } from "../lib/theme.js";
import { MonitorIcon, MoonIcon, SunIcon } from "./Icons.js";

const icons: Record<Theme, (props: { className?: string }) => React.ReactElement> = {
  system: MonitorIcon,
  light: SunIcon,
  dark: MoonIcon,
};

/**
 * 主题切换：跟随系统 / 亮 / 暗。
 *
 * **三个选项都摆出来，而不是一个「切换」按钮。** 两态按钮说不清
 * 「跟随系统」这个状态 —— 而它恰恰是默认值，也是多数人想要的那个。
 *
 * 形态是**胶囊分段 + 滑块**：选中的那一格由一个独立的圆形滑块表示，
 * 换选项时滑块滑过去，而不是两个格子同时闪一下颜色。这一下位移
 * 让人看清「从哪儿到了哪儿」，比瞬间变色更容易确认自己点对了。
 * 开了「减少动态效果」的系统上不滑（motion-reduce），直接就位。
 *
 * 滑块用 `inset-y-0.5` 上下撑满而不是写死高度：触摸设备上
 * dense-target 会把按钮从 32px 顶到 36px（见 index.css），
 * 写死高度的话滑块就对不齐了。
 *
 * 键盘按 radiogroup 的规矩走：整组只占一个 Tab 位（roving tabindex），
 * 进来之后用左右/上下箭头在三档之间移动。三个按钮各占一个 Tab 位
 * 是个常见的错 —— 那会让键盘用户为了跳过一个开关按三次 Tab。
 */
export function ThemeToggle() {
  const { t } = useTranslation();
  const theme = useTheme();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const index = THEMES.indexOf(theme);

  const move = (to: number) => {
    // 首尾相接：在最后一档按右箭头回到第一档，符合 radiogroup 的惯例
    const next = (to + THEMES.length) % THEMES.length;
    setTheme(THEMES[next]!);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={t("theme.label")}
      className="relative inline-flex rounded-full bg-gray-100 p-0.5"
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") move(index + 1);
        else if (e.key === "ArrowLeft" || e.key === "ArrowUp") move(index - 1);
        else if (e.key === "Home") move(0);
        else if (e.key === "End") move(THEMES.length - 1);
        else return;
        // 箭头键在页面上默认是滚动，被这一组接管了就别再滚
        e.preventDefault();
      }}
    >
      {/*
        滑块。宽度和按钮一样是 w-8，所以位移量正好是 100% 的整数倍。
        它在按钮下层（按钮有 relative z-10），图标不会被盖住。
      */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0.5 left-0.5 w-8 rounded-full bg-gray-900 transition-transform duration-200 ease-out motion-reduce:transition-none"
        style={{ transform: `translateX(${index * 100}%)` }}
      />

      {THEMES.map((value, i) => {
        const Icon = icons[value];
        const selected = theme === value;
        return (
          <button
            key={value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            /* 只有选中的那个进 Tab 序列，其余的靠箭头键到达 */
            tabIndex={selected ? 0 : -1}
            title={t(`theme.${value}`)}
            /* dense-target：顶栏这一排不该被撑到 44px，见 index.css 的说明 */
            className={`dense-target relative z-10 flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
              selected ? "text-white" : "text-gray-500 hover:text-gray-900"
            }`}
            onClick={() => setTheme(value)}
          >
            <Icon className="size-4" />
            <span className="sr-only">{t(`theme.${value}`)}</span>
          </button>
        );
      })}
    </div>
  );
}
