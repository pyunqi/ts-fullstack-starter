import { useTranslation } from "react-i18next";
import { NavLink, Navigate, Outlet } from "react-router";
import { BuildInfo } from "./BuildInfo.js";
import { ThemeToggle } from "./ThemeToggle.js";
import { Loading } from "./ui.js";
import { ApiRequestError } from "../lib/apiClient.js";
import { useAdminLogout, useCurrentAdmin } from "../lib/session.js";

/**
 * 管理后台的统一外壳，同时充当路由级别的登录守卫。
 *
 * **导航只是引导，不是权限。** 每个接口自己挂守卫 —— 这里少显示一个入口，
 * 不代表那个接口就调不到。两件事分开，才不会出现「把菜单藏了就以为安全了」。
 */
export function AdminLayout() {
  const { t } = useTranslation();
  const { data: admin, isLoading, error } = useCurrentAdmin();
  const logout = useAdminLogout();

  if (isLoading) return <Loading />;
  // 401 是「没登录」这个正常状态，不是错误页
  if (error instanceof ApiRequestError && error.status === 401) {
    return <Navigate to="/admin/login" replace />;
  }
  if (!admin) return <Navigate to="/admin/login" replace />;

  const isAdmin = admin.role === "admin";

  const items = [
    ...(isAdmin
      ? [
          { to: "/admin/accounts", label: t("nav.accounts") },
          { to: "/admin/settings", label: t("nav.settings") },
          { to: "/admin/archive", label: t("nav.archive") },
          { to: "/admin/audit", label: t("nav.audit") },
        ]
      : []),
    { to: "/admin/password", label: t("nav.password") },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <img src="/brand/logo.svg" alt={t("brand")} className="brand-logo h-7 w-auto" />
          <nav className="flex flex-wrap gap-1 text-sm">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-1.5 ${
                    isActive ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-gray-500">
              {admin.displayName}
              {" · "}
              {t(`admin.role.${admin.role}`)}
            </span>
            <ThemeToggle />
            <button
              type="button"
              onClick={() => logout.mutate()}
              className="rounded-lg border border-gray-300 px-2.5 py-1 text-gray-700 hover:bg-gray-50"
            >
              {t("nav.logout")}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>

      <footer className="mx-auto max-w-5xl px-4 pb-8">
        <BuildInfo />
      </footer>
    </div>
  );
}
