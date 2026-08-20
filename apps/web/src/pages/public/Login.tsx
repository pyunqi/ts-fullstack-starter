import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { Button, Card, ErrorBox, Field, PageTitle, inputClass } from "../../components/ui.js";
import { api } from "../../lib/apiClient.js";
import { describeError, type DescribedError } from "../../lib/errors.js";

export function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [failure, setFailure] = useState<DescribedError | null>(null);

  const login = useMutation({
    mutationFn: () => api.login({ identifier, password }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["auth", "me"] });
      void navigate("/me");
    },
    onError: (err) => setFailure(describeError(err, t)),
  });

  return (
    <div className="mx-auto max-w-sm space-y-4">
      <PageTitle>{t("login.title")}</PageTitle>

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

          {/* 一个输入框收两种标识：服务端按有没有 @ 区分，用户不必先选类型 */}
          <Field label={t("login.identifier")} error={failure?.fields.identifier}>
            <input
              className={inputClass}
              value={identifier}
              autoComplete="username"
              onChange={(e) => setIdentifier(e.target.value)}
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

      <p className="text-center text-sm text-gray-500">
        {t("login.noAccount")}{" "}
        <Link to="/register" className="text-gray-900 underline">
          {t("nav.register")}
        </Link>
      </p>
    </div>
  );
}
