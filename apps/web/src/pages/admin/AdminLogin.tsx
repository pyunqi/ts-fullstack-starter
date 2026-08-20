import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Button, Card, ErrorBox, Field, PageTitle, inputClass } from "../../components/ui.js";
import { adminApi } from "../../lib/apiClient.js";
import { describeError, type DescribedError } from "../../lib/errors.js";

export function AdminLogin() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [failure, setFailure] = useState<DescribedError | null>(null);

  const login = useMutation({
    mutationFn: () => adminApi.login({ username, password }),
    onSuccess: async (admin) => {
      await qc.invalidateQueries({ queryKey: ["admin", "me"] });
      // 按角色决定落地页：受限角色没有账号管理入口，送去它进得去的那一页
      void navigate(admin.role === "admin" ? "/admin/accounts" : "/admin/password");
    },
    onError: (err) => setFailure(describeError(err, t)),
  });

  return (
    <div className="mx-auto mt-16 max-w-sm space-y-4 px-4">
      <PageTitle>{t("adminLogin.title")}</PageTitle>

      <Card>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setFailure(null);
            login.mutate();
          }}
        >
          {failure && <ErrorBox message={failure.message} />}

          <Field label={t("adminLogin.username")} error={failure?.fields.username}>
            <input
              className={inputClass}
              value={username}
              autoComplete="username"
              onChange={(e) => setUsername(e.target.value)}
            />
          </Field>

          <Field label={t("login.password")} error={failure?.fields.password}>
            <input
              className={inputClass}
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>

          <Button type="submit" disabled={login.isPending} className="w-full">
            {login.isPending ? t("common.submitting") : t("login.submit")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
