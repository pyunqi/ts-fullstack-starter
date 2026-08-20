import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { SiteSettings } from "@app/shared";
import { Button, Card, ErrorBox, Field, Loading, PageTitle, inputClass } from "../../components/ui.js";
import { adminApi } from "../../lib/apiClient.js";
import { describeError, errorMessageOf, type DescribedError } from "../../lib/errors.js";

/** 要渲染成输入框的项。加一个设置项时在 shared 加一行，再在这里加一行 */
const FIELDS: { key: keyof SiteSettings; labelKey: string; multiline?: boolean }[] = [
  { key: "siteName", labelKey: "settings.siteName" },
  { key: "siteNameEn", labelKey: "settings.siteNameEn" },
  { key: "heroTitle", labelKey: "settings.heroTitle" },
  { key: "heroTitleEn", labelKey: "settings.heroTitleEn" },
  { key: "heroText", labelKey: "settings.heroText", multiline: true },
  { key: "heroTextEn", labelKey: "settings.heroTextEn", multiline: true },
  { key: "emailFromName", labelKey: "settings.emailFromName" },
  { key: "emailReplyTo", labelKey: "settings.emailReplyTo" },
];

export function AdminSettings() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Partial<SiteSettings>>({});
  const [testTo, setTestTo] = useState("");
  const [failure, setFailure] = useState<DescribedError | null>(null);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["admin", "settings"],
    queryFn: () => adminApi.settings(),
  });

  const save = useMutation({
    mutationFn: () => adminApi.updateSettings(draft),
    onSuccess: async () => {
      setDraft({});
      await qc.invalidateQueries({ queryKey: ["admin", "settings"] });
      // 前台读的是另一个公开接口，同一份数据两个 key，改完两边都要失效
      await qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (err) => setFailure(describeError(err, t)),
  });

  /**
   * 发一封测试邮件。
   *
   * 配好 key 和域名之后最想知道的是「到底通不通」，而这件事光看代码看不出来 ——
   * 域名没验证、额度用完、地址写错，表现都是「对方没收到」。
   */
  const testEmail = useMutation({
    mutationFn: () => adminApi.testEmail(testTo),
    onError: (err) => setFailure(describeError(err, t)),
  });

  if (isLoading || !settings) return <Loading />;

  const valueOf = (key: keyof SiteSettings) => String(draft[key] ?? settings[key] ?? "");
  const set = (key: keyof SiteSettings, value: string) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="max-w-2xl space-y-6">
      <PageTitle>{t("nav.settings")}</PageTitle>
      {failure && <ErrorBox message={failure.message} />}

      <Card>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setFailure(null);
            save.mutate();
          }}
        >
          {/* 英文留空时前台自动回落中文，不必每项都录两遍 */}
          <p className="text-sm text-gray-500">{t("settings.enHint")}</p>

          {FIELDS.map((field) => (
            <Field key={field.key} label={t(field.labelKey)} error={failure?.fields[field.key]}>
              {field.multiline ? (
                <textarea
                  className={inputClass}
                  rows={3}
                  value={valueOf(field.key)}
                  onChange={(e) => set(field.key, e.target.value)}
                />
              ) : (
                <input
                  className={inputClass}
                  value={valueOf(field.key)}
                  onChange={(e) => set(field.key, e.target.value)}
                />
              )}
            </Field>
          ))}

          <Button type="submit" disabled={save.isPending || Object.keys(draft).length === 0}>
            {save.isPending ? t("common.submitting") : t("common.save")}
          </Button>
          {save.isSuccess && (
            <span className="ml-3 text-sm text-green-700">{t("common.saved")}</span>
          )}
        </form>
      </Card>

      <Card>
        <h2 className="mb-2 font-medium text-gray-900">{t("settings.testEmail")}</h2>
        <p className="mb-4 text-sm text-gray-500">{t("settings.testEmailHint")}</p>

        <div className="flex flex-wrap gap-2">
          <input
            className={`${inputClass} max-w-xs`}
            value={testTo}
            placeholder="you@example.com"
            onChange={(e) => setTestTo(e.target.value)}
          />
          <Button
            variant="warn"
            disabled={!testTo || testEmail.isPending}
            onClick={() => {
              setFailure(null);
              testEmail.mutate();
            }}
          >
            {testEmail.isPending ? t("common.submitting") : t("settings.sendTest")}
          </Button>
        </div>

        {testEmail.isSuccess && (
          <p className="mt-3 text-sm text-green-700">{t("settings.testSent")}</p>
        )}
        {testEmail.error && (
          <p className="mt-3 text-sm text-red-700">{errorMessageOf(testEmail.error, t)}</p>
        )}
      </Card>
    </div>
  );
}
