import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { ArchiveType } from "@app/shared";
import { Button, Card, ErrorBox, Loading, PageTitle } from "../../components/ui.js";
import { currentLocale } from "../../i18n/index.js";
import { adminApi } from "../../lib/apiClient.js";
import { errorMessageOf } from "../../lib/errors.js";
import { dateTime } from "../../lib/format.js";

/**
 * 归档区。
 *
 * 各处的「删除」都只是移到这里，数据还在库里、随时能原样恢复。
 * 物理删除只在这一页发生，是第二个显式动作 —— 不可逆的事不该由一次手滑完成。
 */
export function AdminArchive() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const locale = currentLocale();

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "archive"],
    queryFn: () => adminApi.archive(),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "archive"] });

  const restore = useMutation({
    mutationFn: (input: { type: ArchiveType; id: string }) =>
      adminApi.restore(input.type, input.id),
    onSuccess: refresh,
  });

  const purge = useMutation({
    mutationFn: (input: { type: ArchiveType; id: string }) => adminApi.purge(input.type, input.id),
    onSuccess: refresh,
  });

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox message={errorMessageOf(error, t)} />;

  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageTitle>{t("nav.archive")}</PageTitle>
      <p className="text-sm text-gray-500">{t("archive.intro")}</p>

      {(restore.error || purge.error) && (
        <ErrorBox message={errorMessageOf(restore.error ?? purge.error, t)} />
      )}

      {items.length === 0 ? (
        <p className="py-12 text-center text-sm text-gray-400">{t("archive.empty")}</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <Card key={`${item.type}:${item.id}`} dense className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 grow">
                <p className="font-medium text-gray-900">{item.label}</p>
                <p className="text-caption text-gray-500">
                  {t(`archive.type.${item.type}`)}
                  {" · "}
                  {t("archive.archivedAt", { date: dateTime(item.archivedAt, locale) })}
                  {item.archivedByName ? ` · ${item.archivedByName}` : ""}
                </p>
                {/*
                  删不掉的原因在列表里就标出来，而不是等点了删除再报错 ——
                  「点下去才发现不行」会让人以为是系统坏了。
                */}
                {item.deleteBlockedReason && (
                  <p className="text-caption mt-1 text-amber-800">{item.deleteBlockedReason}</p>
                )}
              </div>

              <Button
                size="sm"
                variant="ghost"
                onClick={() => restore.mutate({ type: item.type, id: item.id })}
              >
                {t("archive.restore")}
              </Button>

              <Button
                size="sm"
                variant="danger"
                disabled={item.deleteBlockedReason !== null}
                onClick={() => {
                  if (confirm(t("archive.confirmPurge", { name: item.label }))) {
                    purge.mutate({ type: item.type, id: item.id });
                  }
                }}
              >
                {t("archive.purge")}
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
