import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router";
import { Button, Card, ErrorBox, Field, Loading, PageTitle, inputClass } from "../../components/ui.js";
import { api } from "../../lib/apiClient.js";
import { describeError, type DescribedError } from "../../lib/errors.js";
import { useCurrentUser, useLogout } from "../../lib/session.js";

export function Account() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: user, isLoading } = useCurrentUser();
  const logout = useLogout();

  const [name, setName] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "" });
  const [profileError, setProfileError] = useState<DescribedError | null>(null);
  const [passwordError, setPasswordError] = useState<DescribedError | null>(null);
  const [passwordDone, setPasswordDone] = useState(false);

  const saveProfile = useMutation({
    mutationFn: () => api.updateProfile({ name: name ?? user!.name, phone: phone ?? user?.phone ?? "" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["auth", "me"] }),
    onError: (err) => setProfileError(describeError(err, t)),
  });

  const changePassword = useMutation({
    mutationFn: () => api.changePassword(passwords),
    onSuccess: () => {
      setPasswords({ currentPassword: "", newPassword: "" });
      setPasswordDone(true);
    },
    onError: (err) => setPasswordError(describeError(err, t)),
  });

  if (isLoading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageTitle>{t("me.title")}</PageTitle>

      <Card>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setProfileError(null);
            saveProfile.mutate();
          }}
        >
          <h2 className="font-medium text-gray-900">{t("me.profile")}</h2>
          {profileError && <ErrorBox message={profileError.message} />}

          {/*
            邮箱和用户名是登录标识，改它们要处理唯一性冲突和验证流程，
            所以这里只读展示，不给编辑入口。见 shared 的 profileUpdateSchema。
          */}
          <Field label={t("register.email")}>
            <input className={`${inputClass} bg-gray-100`} value={user.email} readOnly />
          </Field>

          <Field label={t("register.name")} error={profileError?.fields.name}>
            <input
              className={inputClass}
              value={name ?? user.name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>

          <Field label={t("register.phoneOptional")} error={profileError?.fields.phone}>
            <input
              className={inputClass}
              value={phone ?? user.phone ?? ""}
              onChange={(e) => setPhone(e.target.value)}
            />
          </Field>

          <Button type="submit" disabled={saveProfile.isPending}>
            {saveProfile.isPending ? t("common.submitting") : t("common.save")}
          </Button>
          {saveProfile.isSuccess && (
            <span className="ml-3 text-sm text-green-700">{t("common.saved")}</span>
          )}
        </form>
      </Card>

      <Card>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setPasswordError(null);
            setPasswordDone(false);
            changePassword.mutate();
          }}
        >
          <h2 className="font-medium text-gray-900">{t("me.password")}</h2>
          {/* 改完密码其他设备会掉线，事先说清楚，免得当成故障 */}
          <p className="text-sm text-gray-500">{t("me.passwordHint")}</p>
          {passwordError && <ErrorBox message={passwordError.message} />}
          {passwordDone && <p className="text-sm text-green-700">{t("me.passwordDone")}</p>}

          <Field label={t("me.currentPassword")} error={passwordError?.fields.currentPassword}>
            <input
              className={inputClass}
              type="password"
              autoComplete="current-password"
              value={passwords.currentPassword}
              onChange={(e) => setPasswords((p) => ({ ...p, currentPassword: e.target.value }))}
            />
          </Field>

          <Field label={t("me.newPassword")} error={passwordError?.fields.newPassword}>
            <input
              className={inputClass}
              type="password"
              autoComplete="new-password"
              value={passwords.newPassword}
              onChange={(e) => setPasswords((p) => ({ ...p, newPassword: e.target.value }))}
            />
          </Field>

          <Button type="submit" disabled={changePassword.isPending}>
            {changePassword.isPending ? t("common.submitting") : t("me.changePassword")}
          </Button>
        </form>
      </Card>

      <Button variant="ghost" onClick={() => logout.mutate()}>
        {t("nav.logout")}
      </Button>
    </div>
  );
}
