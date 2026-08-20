import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Card, Loading, PageTitle } from "../../components/ui.js";
import { currentLocale } from "../../i18n/index.js";
import { api } from "../../lib/apiClient.js";
import { localizedText } from "../../lib/format.js";

/**
 * 首页。骨架里它只做一件事：证明「站点设置 → 前台文案」这条链路是通的。
 *
 * 横幅文案留空时回落到 i18n 里的默认句子，而不是显示一片空白 ——
 * 刚装好的站不该顶着两行空。
 */
export function Home() {
  const { t } = useTranslation();
  const locale = currentLocale();
  const { data: settings, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.settings(),
  });

  if (isLoading) return <Loading />;

  const title = localizedText(settings?.heroTitle ?? "", settings?.heroTitleEn, locale) || t("home.title");
  const text = localizedText(settings?.heroText ?? "", settings?.heroTextEn, locale) || t("home.text");

  return (
    <div className="space-y-6">
      <PageTitle>{title}</PageTitle>
      <p className="text-gray-600">{text}</p>

      <Card>
        <h2 className="mb-2 font-medium text-gray-900">{t("home.nextTitle")}</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-gray-600">
          <li>{t("home.next1")}</li>
          <li>{t("home.next2")}</li>
          <li>{t("home.next3")}</li>
        </ul>
        <p className="mt-4 text-sm">
          <Link to="/admin/login" className="text-gray-900 underline">
            {t("home.adminEntry")}
          </Link>
        </p>
      </Card>
    </div>
  );
}
