import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, ErrorBox, Loading, PageTitle } from "../../components/ui.js";
import { Pager } from "../../components/Pager.js";
import { currentLocale } from "../../i18n/index.js";
import { adminApi } from "../../lib/apiClient.js";
import { errorMessageOf } from "../../lib/errors.js";
import { dateTime } from "../../lib/format.js";

const PAGE_SIZE = 50;

/**
 * 动作分组。**取值登记在 scripts/check-i18n-keys.mjs 的 FAMILIES 里** ——
 * 加一组而忘了补中英文案时，那个守卫会挂。
 *
 * 分组用的是 action 的前缀，这个约定在 lib/audit.ts 的 AuditAction 里定死：
 * 形如 `account.create`，点号前面就是对象类型。
 */
const ACTION_GROUPS = ["auth", "account", "user", "image", "settings", "archive"] as const;

export function AdminAudit() {
  const { t } = useTranslation();
  const locale = currentLocale();
  const [group, setGroup] = useState<string>("all");
  const [offset, setOffset] = useState(0);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "audit", group, offset],
    queryFn: () =>
      adminApi.audit({
        limit: PAGE_SIZE,
        offset,
        ...(group === "all" ? {} : { action: group }),
      }),
    // 翻页时保留上一页，否则每翻一页整个列表会闪一下空白
    placeholderData: keepPreviousData,
  });

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox message={errorMessageOf(error, t)} />;

  return (
    <div className="space-y-6">
      <PageTitle>{t("nav.audit")}</PageTitle>

      <div className="flex flex-wrap gap-2">
        {["all", ...ACTION_GROUPS].map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setGroup(key);
              // 换筛选条件要回到第一页，否则会停在一个可能不存在的偏移上
              setOffset(0);
            }}
            className={`rounded-full px-3 py-1 text-sm ${
              group === key ? "bg-gray-900 text-white" : "border border-gray-300 text-gray-600"
            }`}
          >
            {t(`admin.auditGroup.${key}`)}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {data?.items.map((log) => (
          <Card key={log.id} dense>
            <p className="text-sm text-gray-900">{log.summary ?? log.action}</p>
            <p className="text-caption text-gray-500">
              {dateTime(log.at, locale)}
              {" · "}
              <span className="font-mono">{log.action}</span>
              {log.actorName ? ` · ${log.actorName}` : ""}
              {log.ip ? ` · ${log.ip}` : ""}
            </p>
          </Card>
        ))}
      </div>

      {data && (
        <Pager
          total={data.total}
          limit={data.limit}
          offset={data.offset}
          onChange={(next) => setOffset(next)}
        />
      )}
    </div>
  );
}
