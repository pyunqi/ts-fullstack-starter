import { useSyncExternalStore } from "react";

export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

const STORAGE_KEY = "app_theme";

/**
 * 主题偏好。
 *
 * **`system` 不写 `data-theme`，让 CSS 的 prefers-color-scheme 接管**
 * （见 index.css 里那段 `:root:not([data-theme=...])`）。
 * 这样跟随系统是真的跟随 —— 用户在系统里切换深浅，页面立刻跟着变，
 * 不需要我们监听任何事件。
 *
 * 选了亮或暗之后才写 `data-theme`，那个属性的优先级盖过系统偏好。
 */
function read(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return THEMES.includes(saved as Theme) ? (saved as Theme) : "system";
  } catch {
    // 隐私模式下 localStorage 会抛异常，不该因此白屏
    return "system";
  }
}

function apply(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

const listeners = new Set<() => void>();
let current: Theme = "system";

/**
 * 在 React 挂载之前就把主题贴上去。
 *
 * 放在 main.tsx 的最前面调用 —— 晚一步的话，页面会先按亮色渲染一帧
 * 再跳成暗色，那一下白闪在暗环境里很刺眼（俗称 FOUC）。
 */
export function initTheme(): void {
  current = read();
  apply(current);
}

export function setTheme(next: Theme): void {
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // 存不下也不影响这一次会话生效
  }
  apply(next);
  for (const fn of listeners) fn();
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => current,
    () => "system" as Theme,
  );
}
