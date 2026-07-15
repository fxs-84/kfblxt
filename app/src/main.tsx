import { useState } from "react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import "./styles/tokens.css";
import "./styles/layout.css";
import "./styles/print.css";
import { router } from "./app/router";
import { SetupWizard, readStoredConfig, type SupabaseConfig } from "./components/SetupWizard";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
});

/**
 * 根组件 — 启动时优先读浏览器 localStorage 里的 Supabase 配置。
 *   - 有配置 → 加载完整 app
 *   - 没有配置 → 弹配置向导(用户填一次,存到 localStorage)
 *   - 用户点"暂时跳过" → 走单机演示(localStorage 模式)
 */
function Root() {
  const [configState, setConfigState] = useState<"pending" | "skipped" | "ready">(() =>
    readStoredConfig() ? "ready" : "pending",
  );

  if (configState === "pending") {
    return (
      <SetupWizard
        onConfigured={(cfg: SupabaseConfig) => {
          localStorage.setItem("kfblxt:supabase:config", JSON.stringify(cfg));
          window.location.reload();
        }}
        onSkip={() => setConfigState("skipped")}
      />
    );
  }

  return <RouterProvider router={router} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Root />
    </QueryClientProvider>
  </StrictMode>,
);
