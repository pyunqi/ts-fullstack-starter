import { useTranslation } from "react-i18next";
import { Link, Outlet } from "react-router";
import { Avatar } from "./Avatar.js";
import { ThemeToggle } from "./ThemeToggle.js";
import { currentLocale, setLocale } from "../i18n/index.js";
import { useCurrentUser } from "../lib/session.js";

export function PublicLayout() {
  const { t } = useTranslation();
  const { data: user } = useCurrentUser();
  const locale = currentLocale();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <nav className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-3">
          {/*
            用标志图而不是文字品牌名：字标是画出来的路径，在任何机器上都一致；
            用 <text> 或 CSS 字体会随系统字体变形。
            alt 仍给品牌名，读屏和图片加载失败时不会只剩一个空块。
          */}
          <Link to="/" className="shrink-0">
            <img src="/brand/logo.svg" alt={t("brand")} className="brand-logo h-7 w-auto" />
          </Link>

          <div className="ml-auto flex items-center gap-3 text-sm">
            {user ? (
              <Link to="/me" className="flex items-center gap-1.5 text-gray-600 hover:text-gray-900">
                <Avatar name={user.name} seed={user.id} size={24} />
                {t("nav.me")}
              </Link>
            ) : (
              <>
                <Link to="/login" className="text-gray-600 hover:text-gray-900">
                  {t("nav.login")}
                </Link>
                <Link to="/register" className="text-gray-600 hover:text-gray-900">
                  {t("nav.register")}
                </Link>
              </>
            )}
            <ThemeToggle />
            <button
              type="button"
              onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
              className="rounded-lg border border-gray-300 px-2.5 py-1 text-gray-700 hover:bg-gray-50"
            >
              {t("nav.language")}
            </button>
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
