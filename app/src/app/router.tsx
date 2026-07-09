import { createBrowserRouter, Navigate, useSearchParams } from "react-router-dom";
import { AppLayout } from "./AppLayout";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { PatientListPage } from "../features/patients/pages/PatientListPage";
import { PatientFormPage } from "../features/patients/pages/PatientFormPage";
import { PatientDetailPage } from "../features/patients/pages/PatientDetailPage";
import { PatientViewPage } from "../features/share/PatientViewPage";
import { MembershipEngineBootstrap } from "../features/membership/MembershipEngineBootstrap";
import { RulesListPage } from "../features/membership/pages/RulesListPage";
import { RuleEditPage } from "../features/membership/pages/RuleEditPage";
import { TierConfigPage } from "../features/membership/pages/TierConfigPage";
import { RuleTestPage } from "../features/membership/pages/RuleTestPage";
import { ShopPage } from "../features/membership/pages/ShopPage";
import { RewardReviewPage } from "../features/membership/pages/RewardReviewPage";
import { ProductManagePage } from "../features/membership/pages/ProductManagePage";
import { MembershipCenterPage } from "../features/membership/pages/MembershipCenterPage";
import { PointsHistoryPage } from "../features/membership/pages/PointsHistoryPage";
import { RedeemCreatePage } from "../features/membership/pages/RedeemCreatePage";
import { PatientMembershipRoutePage } from "../features/membership/pages/PatientMembershipRoutePage";

const basename = location.hostname.includes("github.io") ? "/kfblxt/" : "/";

/**
 * 根路由分流:
 * - ?share=<token> → 直接渲染 PatientViewPage,不经过 AppLayout(无侧栏/header)
 * - 无 share 参数 → AppLayout 正常渲染,Outlet 走子路由
 */
function LayoutGate() {
  const [searchParams] = useSearchParams();
  if (searchParams.get("share")) return <PatientViewPage />;
  return (
    <>
      <MembershipEngineBootstrap />
      <AppLayout />
    </>
  );
}

export const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <LayoutGate />,
      children: [
        { index: true, element: <DashboardPage /> },
        { path: "patients", element: <PatientListPage /> },
        { path: "patients/new", element: <PatientFormPage /> },
        { path: "patients/:id", element: <PatientDetailPage /> },
        { path: "patients/:id/membership", element: <PatientMembershipRoutePage /> },
        { path: "membership/rules", element: <RulesListPage /> },
        { path: "membership/rules/new", element: <RuleEditPage /> },
        { path: "membership/rules/:id", element: <RuleEditPage /> },
        { path: "membership/tiers", element: <TierConfigPage /> },
        { path: "membership/test", element: <RuleTestPage /> },
        { path: "membership/products", element: <ProductManagePage /> },
        { path: "membership/review", element: <RewardReviewPage /> },
        { path: "membership/dashboard", element: <MembershipCenterPage /> },
        { path: "membership/points/:patientId", element: <PointsHistoryPage /> },
        { path: "membership/redeem/:patientId", element: <RedeemCreatePage /> },
        { path: "membership/shop/:patientId", element: <ShopPage /> },
        { path: "*", element: <Navigate to="/" replace /> },
      ],
    },
    // 老链接 /share/<token> 保留
    { path: "/share/:token", element: <PatientViewPage /> },
  ],
  { basename },
);
