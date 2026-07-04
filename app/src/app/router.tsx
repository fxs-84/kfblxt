import { createBrowserRouter, Navigate } from "react-router-dom";
import { useSearchParams } from "react-router-dom";
import { AppLayout } from "./AppLayout";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { PatientListPage } from "../features/patients/pages/PatientListPage";
import { PatientFormPage } from "../features/patients/pages/PatientFormPage";
import { PatientDetailPage } from "../features/patients/pages/PatientDetailPage";
import { PatientViewPage } from "../features/share/PatientViewPage";

const basename = location.hostname.includes("github.io") ? "/kfblxt/" : "/";

/** 根路由分发:?share=<token> → 患者共享视图,否则 → 工作台 */
function RootPage() {
  const [searchParams] = useSearchParams();
  if (searchParams.get("share")) return <PatientViewPage />;
  return <DashboardPage />;
}

export const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <AppLayout />,
      children: [
        { index: true, element: <RootPage /> },
        { path: "patients", element: <PatientListPage /> },
        { path: "patients/new", element: <PatientFormPage /> },
        { path: "patients/:id", element: <PatientDetailPage /> },
        { path: "*", element: <Navigate to="/" replace /> },
      ],
    },
    // 患者端分享视图(无需登录,无侧栏)
    // /?share=<token> 走 RootPage 分发; /share/<token> 是老链接保留
    { path: "/share/:token", element: <PatientViewPage /> },
  ],
  { basename },
);
