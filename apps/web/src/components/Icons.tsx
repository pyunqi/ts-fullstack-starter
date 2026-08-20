/**
 * 界面图标。
 *
 * **手写内联 SVG，不装图标库。** 图标库（lucide 之类）为这几个图标引入
 * 一个依赖不划算，而且这个项目的三个业务包是刻意平台无关的
 * （见 scripts/check-platform.mjs），前端这边也没必要多养一棵依赖树。
 * 需要新图标时照着下面的样子加一个函数就行 —— 24 格画布、只描边。
 *
 * **别再用字符当图标。** 这里替换掉的是两批：主题开关的 `🖥 ☀ ☾`，
 * 以及各处的 `←` `→`。字符图标有三个躲不开的毛病：
 *
 * 1. **跨平台不一致** —— macOS 把 emoji 渲染成彩色字形，Windows 是
 *    单色字形，Android 又一套。字重、大小、基线三样都对不齐
 * 2. **不跟文字颜色走** —— 选中态文字变白了，彩色 emoji 还是彩色
 * 3. **尺寸受字体摆布** —— 字号一样，实际画出来多大取决于装了什么字体
 *
 * SVG 用 currentColor 和显式的 viewBox，这三样全都确定。
 *
 * 尺寸靠 className 给（`size-4` 之类），这里不写死。
 */
type IconProps = { className?: string };

/** 所有图标共用的画布设置：24 格、只描边不填充、圆头圆角 */
function Svg({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      /* 图标是装饰，含义由旁边的 sr-only 文字承担，读屏不该念它 */
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** 跟随系统 */
export function MonitorIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </Svg>
  );
}

/** 亮色 */
export function SunIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </Svg>
  );
}

/** 暗色 */
export function MoonIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </Svg>
  );
}

/** 返回、前移。带尾巴的箭头而不是单个尖角（‹）—— 尖角更像「展开」 */
export function ArrowLeftIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </Svg>
  );
}

/** 后移 */
export function ArrowRightIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M5 12h14M12 5l7 7-7 7" />
    </Svg>
  );
}
