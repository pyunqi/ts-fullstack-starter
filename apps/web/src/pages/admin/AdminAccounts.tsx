import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Card,
  ErrorBox,
  Field,
  Loading,
  PageTitle,
  StatusBadge,
  inputClass,
} from "../../components/ui.js";
import { currentLocale } from "../../i18n/index.js";
import { adminApi } from "../../lib/apiClient.js";
import { describeError, type DescribedError } from "../../lib/errors.js";
import { dateOnly } from "../../lib/format.js";

export function AdminAccounts() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const locale = currentLocale();
  const [form, setForm] = useState({
    username: "",
    password: "",
    displayName: "",
    role: "staff" as "admin" | "staff",
  });
  const [failure, setFailure] = useState<DescribedError | null>(null);

  const { data: accounts, isLoading } = useQuery({
    queryKey: ["admin", "accounts"],
    queryFn: () => adminApi.accounts(),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "accounts"] });

  const create = useMutation({
    mutationFn: () => adminApi.createAccount(form),
    onSuccess: async () => {
      setForm({ username: "", password: "", displayName: "", role: "staff" });
      await refresh();
    },
    onError: (err) => setFailure(describeError(err, t)),
  });

  const toggle = useMutation({
    mutationFn: (input: { id: string; disabled: boolean }) =>
      adminApi.updateAccount(input.id, { disabled: input.disabled }),
    onSuccess: refresh,
    onError: (err) => setFailure(describeError(err, t)),
  });

  const archive = useMutation({
    mutationFn: (id: string) => adminApi.archiveAccount(id),
    onSuccess: refresh,
    onError: (err) => setFailure(describeError(err, t)),
  });

  if (isLoading) return <Loading />;

  return (
    <div className="space-y-6">
      <PageTitle>{t("nav.accounts")}</PageTitle>
      {failure && <ErrorBox message={failure.message} />}

      <Card>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            setFailure(null);
            create.mutate();
          }}
        >
          <Field label={t("adminLogin.username")} error={failure?.fields.username}>
            <input
              className={inputClass}
              value={form.username}
              onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
            />
          </Field>

          <Field label={t("accounts.displayName")} error={failure?.fields.displayName}>
            <input
              className={inputClass}
              value={form.displayName}
              onChange={(e) => setForm((p) => ({ ...p, displayName: e.target.value }))}
            />
          </Field>

          <Field label={t("login.password")} error={failure?.fields.password}>
            <input
              className={inputClass}
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
            />
          </Field>

          <Field label={t("accounts.role")} error={failure?.fields.role}>
            <select
              className={inputClass}
              value={form.role}
              onChange={(e) => setForm((p) => ({ ...p, role: e.target.value as "admin" | "staff" }))}
            >
              <option value="staff">{t("admin.role.staff")}</option>
              <option value="admin">{t("admin.role.admin")}</option>
            </select>
          </Field>

          <div className="sm:col-span-2">
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? t("common.submitting") : t("accounts.create")}
            </Button>
          </div>
        </form>
      </Card>

      <div className="space-y-2">
        {accounts?.map((account) => (
          <Card key={account.id} dense className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 grow">
              <p className="font-medium text-gray-900">
                {account.displayName}
                <span className="ml-2 text-sm font-normal text-gray-500">@{account.username}</span>
              </p>
              <p className="text-caption text-gray-500">
                {t(`admin.role.${account.role}`)}
                {" · "}
                {t("accounts.createdAt", { date: dateOnly(account.createdAt, locale) })}
                {" · "}
                {account.lastLoginAt
                  ? t("accounts.lastLogin", { date: dateOnly(account.lastLoginAt, locale) })
                  : t("accounts.neverLoggedIn")}
              </p>
            </div>

            {/* 停用 ≠ 归档：前者是日常操作，账号还在列表里；后者是删除 */}
            <StatusBadge
              label={account.disabled ? t("accounts.disabled") : t("accounts.active")}
              tone={account.disabled ? "gray" : "green"}
            />

            <Button
              size="sm"
              variant="ghost"
              onClick={() => toggle.mutate({ id: account.id, disabled: !account.disabled })}
            >
              {account.disabled ? t("accounts.enable") : t("accounts.disable")}
            </Button>

            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                // 归档是可恢复的，所以一次确认就够；不可逆的物理删除在归档区里
                if (confirm(t("accounts.confirmArchive", { name: account.displayName }))) {
                  archive.mutate(account.id);
                }
              }}
            >
              {t("common.delete")}
            </Button>
          </Card>
        ))}
      </div>

      <p className="text-sm text-gray-500">{t("accounts.archiveHint")}</p>
    </div>
  );
}
