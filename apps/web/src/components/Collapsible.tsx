import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

/**
 * 超过一定高度就收起来，底部给一个「展开全部」。
 *
 * **只在真的超高时才收。** 内容本来就短的话，一个「展开全部」按钮
 * 点下去什么也不变，比不收还糟 —— 所以这里量了真实高度再决定，
 * 而不是按字数猜。字数和高度对不上：一段话里塞十张图和塞十行字，
 * 高度差着数量级。
 *
 * 收起时底部盖一层渐隐，让「下面还有」这件事不靠读文字就能看出来。
 * 只给按钮不给渐隐的话，用户常常以为内容就到这儿了。
 */
export function Collapsible({
  children,
  maxHeight = 420,
}: {
  children: ReactNode;
  /** 超过这个高度（px）才收起 */
  maxHeight?: number;
}) {
  const { t } = useTranslation();
  const inner = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const el = inner.current;
    if (!el) return;

    const measure = () => setOverflows(el.scrollHeight > maxHeight + 40);
    measure();

    /*
      图片是异步加载的，第一次量的时候它们高度还是 0 —— 只量一次的话，
      一篇全是图的介绍会被判定成「不需要收起」，然后整页拉得很长。
      ResizeObserver 会在图片陆续到位、高度变化时重新量。
    */
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [maxHeight, children]);

  return (
    <div>
      <div
        className="relative overflow-hidden transition-[max-height] duration-300"
        style={{ maxHeight: expanded || !overflows ? undefined : maxHeight }}
      >
        <div ref={inner}>{children}</div>

        {overflows && !expanded && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-white to-transparent"
          />
        )}
      </div>

      {overflows && (
        <button
          type="button"
          className="mt-2 w-full rounded-lg border border-gray-200 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? t("common.collapse") : t("common.expandAll")}
        </button>
      )}
    </div>
  );
}
