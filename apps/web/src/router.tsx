import { useTranslation } from "react-i18next";
import { Navigate, Route, Routes } from "react-router";
import { AdminLayout } from "./components/AdminLayout.js";
import { PublicLayout } from "./components/PublicLayout.js";
import { AdminAccounts } from "./pages/admin/AdminAccounts.js";
import { AdminArchive } from "./pages/admin/AdminArchive.js";
import { AdminAudit } from "./pages/admin/AdminAudit.js";
import { AdminLogin } from "./pages/admin/AdminLogin.js";
import { AdminPassword } from "./pages/admin/AdminPassword.js";
import { AdminSettings } from "./pages/admin/AdminSettings.js";
import { Account } from "./pages/me/Account.js";
import { Home } from "./pages/public/Home.js";
import { Login } from "./pages/public/Login.js";
import { Register } from "./pages/public/Register.js";

function NotFound() {
  const { t } = useTranslation();
  return <p className="py-16 text-center text-gray-500">{t("error.notFound")}</p>;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<Home />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="me" element={<Account />} />
      </Route>

      {/*
        后台登录页在 AdminLayout 之外 —— 那个布局本身就是登录守卫，
        把登录页放进去会变成「要先登录才能看到登录页」的死循环。
      */}
      <Route path="admin/login" element={<AdminLogin />} />

      <Route path="admin" element={<AdminLayout />}>
        <Route index element={<Navigate to="/admin/accounts" replace />} />
        <Route path="accounts" element={<AdminAccounts />} />
        <Route path="settings" element={<AdminSettings />} />
        <Route path="archive" element={<AdminArchive />} />
        <Route path="audit" element={<AdminAudit />} />
        <Route path="password" element={<AdminPassword />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
