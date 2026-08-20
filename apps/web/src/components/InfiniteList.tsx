import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./ui.js";

/**
 * 下拉加载更多的哨兵。
 *
 * **既有自动加载，也留一个按钮。** 只做自动的话，三种人会卡住：
 * 用键盘翻页的、开了「减少动态效果」的、以及网络抖了一下加载失败的人 ——
 * 对他们来说列表就是没有下文了，而且没有任何可点的东西。
 * 按钮平时看起来只是个「加载更多」，实际是那三种情况唯一的出路。
 *
 * 哨兵放在列表**下方一屏的位置**（rootMargin），滚到列表底部之前就开始
 * 取下一页，读者感觉不到等待。留太窄会看到空白再看到内容，
 * 留太宽则会在用户根本没往下滚时就把好几页都拉回来。
 */
export function InfiniteList({
  hasMore,
  isLoading,
  onLoadMore,
}: {
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
}) {
  const { t } = useTranslation();
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // isLoading 由调用方传进来，避免同一页被连着请求两次
        if (entries[0]?.isIntersecting && !isLoading) onLoadMore();
      },
      { rootMargin: "600px 0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, isLoading, onLoadMore]);

  if (!hasMore) return null;

  return (
    <div ref={sentinel} className="flex justify-center py-6">
      <Button variant="ghost" disabled={isLoading} onClick={onLoadMore}>
        {isLoading ? t("common.loading") : t("common.loadMore")}
      </Button>
    </div>
  );
}
