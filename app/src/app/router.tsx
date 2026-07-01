import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppLayout } from "./AppLayout";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { PatientListPage } from "../features/patients/pages/PatientListPage";
import { PatientFormPage } from "../features/patients/pages/PatientFormPage";
import { PatientDetailPage } from "../features/patients/pages/PatientDetailPage";
import { PatientViewPage } from "../features/share/PatientViewPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "patients", element: <PatientListPage /> },
      { path: "patients/new", element: <PatientFormPage /> },
      { path: "patients/:id", element: <PatientDetailPage /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
  // 患者端分享视图(无需登录,无侧栏)
  { path: "/share/:token", element: <PatientViewPage /> },
]);
