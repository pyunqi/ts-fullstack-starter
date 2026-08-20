import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Card, ErrorBox, Field, PageTitle, inputClass } from "../../components/ui.js";
import { adminApi } from "../../lib/apiClient.js";
import { describeError, type DescribedError } from "../../lib/errors.js";

/**
 * 改自己的密码。**每种后台角色都要有这条路径** ——
 * 没有它，密码泄露时没有任何办法让已签发的 token 失效，只能等它自然过期。
 */
export function AdminPassword() {
  const { t } = useTranslation();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "" });
  const [failure, setFailure] = useState<DescribedError | null>(null);

  const change = useMutation({
    mutationFn: () => adminApi.changePassword(form),
    onSuccess: () => setForm({ currentPassword: "", newPassword: "" }),
    onError: (err) => setFailure(describeError(err, t)),
  });

  return (
    <div className="max-w-md space-y-4">
      <PageTitle>{t("me.password")}</PageTitle>

      <Card>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setFailure(null);
            change.mutate();
          }}
        >
          <p className="text-sm text-gray-500">{t("me.passwordHint")}</p>
          {failure && <ErrorBox message={failure.message} />}
          {change.isSuccess && <p className="text-sm text-green-700">{t("me.passwordDone")}</p>}

          <Field label={t("me.currentPassword")} error={failure?.fields.currentPassword}>
            <input
              className={inputClass}
              type="password"
              autoComplete="current-password"
              value={form.currentPassword}
              onChange={(e) => setForm((p) => ({ ...p, currentPassword: e.target.value }))}
            />
          </Field>

          <Field label={t("me.newPassword")} error={failure?.fields.newPassword}>
            <input
              className={inputClass}
              type="password"
              autoComplete="new-password"
              value={form.newPassword}
              onChange={(e) => setForm((p) => ({ ...p, newPassword: e.target.value }))}
            />
          </Field>

          <Button type="submit" disabled={change.isPending}>
            {change.isPending ? t("common.submitting") : t("me.changePassword")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
