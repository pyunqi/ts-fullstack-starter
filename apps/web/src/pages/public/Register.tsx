import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { Button, Card, ErrorBox, Field, PageTitle, inputClass } from "../../components/ui.js";
import { api } from "../../lib/apiClient.js";
import { describeError, type DescribedError } from "../../lib/errors.js";

export function Register() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    email: "",
    username: "",
    password: "",
    name: "",
    phone: "",
  });
  const [failure, setFailure] = useState<DescribedError | null>(null);

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const register = useMutation({
    mutationFn: () => api.register(form),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["auth", "me"] });
      void navigate("/me");
    },
    onError: (err) => setFailure(describeError(err, t)),
  });

  /**
   * 邮箱和用户名重复时，服务端给的是两个不同的错误码 ——
   * 这里把整句挂到对应的输入框下面，而不是只在顶部说一句
   * 「已被占用」让用户自己猜是哪一栏。
   */
  const fieldError = (field: string): string | undefined => {
    if (failure?.fields[field]) return failure.fields[field];
    if (field === "email" && failure?.code === "email_taken") return failure.message;
    if (field === "username" && failure?.code === "username_taken") return failure.message;
    return undefined;
  };

  return (
    <div className="mx-auto max-w-sm space-y-4">
      <PageTitle>{t("register.title")}</PageTitle>

      <Card>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setFailure(null);
            register.mutate();
          }}
        >
          {failure && <ErrorBox message={failure.message} />}

          <Field label={t("register.email")} error={fieldError("email")}>
            <input className={inputClass} value={form.email} onChange={set("email")} />
          </Field>

          <Field label={t("register.username")} error={fieldError("username")}>
            <input className={inputClass} value={form.username} onChange={set("username")} />
          </Field>

          <Field label={t("register.password")} error={fieldError("password")}>
            <input
              className={inputClass}
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={set("password")}
            />
          </Field>

          <Field label={t("register.name")} error={fieldError("name")}>
            <input className={inputClass} value={form.name} onChange={set("name")} />
          </Field>

          {/* 手机号不强制：强制只会收到一堆假号码，数据反而更脏 */}
          <Field label={t("register.phoneOptional")} error={fieldError("phone")}>
            <input className={inputClass} value={form.phone} onChange={set("phone")} />
          </Field>

          <Button type="submit" disabled={register.isPending} className="w-full">
            {register.isPending ? t("common.submitting") : t("register.submit")}
          </Button>
        </form>
      </Card>

      <p className="text-center text-sm text-gray-500">
        {t("register.hasAccount")}{" "}
        <Link to="/login" className="text-gray-900 underline">
          {t("nav.login")}
        </Link>
      </p>
    </div>
  );
}
