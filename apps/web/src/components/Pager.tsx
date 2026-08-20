import { useTranslation } from "react-i18next";
import { Button } from "./ui.js";

/**
 * 列表翻页控件。
 *
 * 用「上一页 / 下一页 + 区间」而不是页码按钮：页码需要预先知道总页数并渲染一排按钮，
 * 而运营在这些页面上的实际行为是配合筛选缩小范围，不是跳到第 37 页。
 *
 * 总数一定要显示 —— 「共 N 条」是判断规模的依据，光看当前页猜不出来。
 */
export function Pager({
  total,
  limit,
  offset,
  onChange,
}: {
  total: number;
  limit: number;
  offset: number;
  onChange: (nextOffset: number) => void;
}) {
  const { t } = useTranslation();

  // 只有一页时整个控件不出现，避免在小数据量下平白多一行噪音
  if (total <= limit) return null;

  const from = offset + 1;
  const to = Math.min(offset + limit, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
      <span className="text-caption text-brand-stone tabular-nums">
        {t("common.pageRange", { from, to, total })}
      </span>
      <div className="flex gap-2">
        <Button
          variant="ghost"
          disabled={offset <= 0}
          onClick={() => onChange(Math.max(0, offset - limit))}
        >
          {t("common.prevPage")}
        </Button>
        <Button variant="ghost" disabled={to >= total} onClick={() => onChange(offset + limit)}>
          {t("common.nextPage")}
        </Button>
      </div>
    </div>
  );
}
