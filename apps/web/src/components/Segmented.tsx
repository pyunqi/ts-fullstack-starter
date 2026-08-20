export type Tone = "gray" | "green" | "amber" | "red";

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  /** 选中时的配色。和 StatusBadge 用同一套色板，同一个状态在哪儿看都是同一个颜色 */
  tone: Tone;
  /** 不允许切到这个取值。**置灰而不是移除** —— 见组件说明 */
  disabled?: boolean;
  /** 置灰的原因，鼠标悬停时显示。运营看不到解释就只会觉得是坏了 */
  title?: string;
};

/**
 * 状态分段选择器。
 *
 * **把一个维度的所有取值都摆出来，当前那个高亮，点另一个就切过去。**
 * 这和「一个按钮点了就翻转」有三处不同，每一处都是故意的：
 *
 * 1. **看得见有哪些选择。** 一个写着「取消」的按钮，不点下去不知道点完会
 *    变成什么；两段并排写着「有效 / 已取消」，当前在哪、能去哪一目了然。
 *
 * 2. **高度不变。** 段数是固定的，切换状态不会让卡片长高或变矮。
 *    用「点了才出现另一个按钮」那种写法，一次点击就让下面所有卡片
 *    跳一下位置，而运营常常要连着改好几单。
 *
 * 3. **不允许的取值置灰，不是藏起来。** 藏起来的话，「为什么这里没有
 *    取消」得靠人猜；置灰加一句悬停说明，规则本身就写在界面上了。
 */
export function Segmented<T extends string>({
  value,
  options,
  disabled = false,
  onChange,
}: {
  value: T;
  options: SegmentedOption<T>[];
  /** 整组禁用，用于请求进行中 */
  disabled?: boolean;
  onChange: (next: T) => void;
}) {
  const selectedTone: Record<Tone, string> = {
    gray: "bg-gray-600 text-white",
    green: "bg-green-600 text-white",
    amber: "bg-amber-500 text-white",
    red: "bg-red-600 text-white",
  };

  return (
    /*
      inline-flex + 外框：几段看起来是一个整体的控件，而不是几个各自
      独立的按钮。p-0.5 给选中态留出内嵌的空隙，切换时那一格像是滑过去的。
    */
    <div className="inline-flex rounded-lg border border-gray-300 bg-gray-50 p-0.5">
      {options.map((option) => {
        const active = option.value === value;
        const blocked = disabled || option.disabled;

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            title={option.title}
            disabled={blocked || active}
            className={`dense-target rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              active
                ? `${selectedTone[option.tone]} shadow-sm`
                : blocked
                  ? "text-gray-300"
                  : "text-gray-600 hover:bg-white hover:text-gray-900"
            } ${blocked && !active ? "cursor-not-allowed" : ""}`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
