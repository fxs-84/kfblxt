import { useState } from "react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import "./styles/tokens.css";
import "./styles/layout.css";
import "./styles/print.css";
import { router } from "./app/router";
import { SetupWizard, isSupabaseSkipped, type SupabaseConfig } from "./components/SetupWizard";
import { hasSupabaseConfig } from "./lib/supabase";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
});

/**
 * 根组件 — 启动时解析 Supabase 配置来源:
 *   - 浏览器 localStorage(用户/治疗师在向导里填的)或构建时注入的
 *     VITE_SUPABASE_URL + ANON_KEY → 直接加载完整 app
 *   - 扫码分享链接(?share=…)→ 无条件放行:客户设备无需任何配置,
 *     页面内经 share-gateway 公共函数读写数据(key 只在服务端)
 *   - 都没有 → 弹配置向导(BYOS 自托管兜底,填一次存 localStorage)
 *   - 用户点"暂时跳过" → 走单机演示(localStorage 模式)
 */
function Root() {
  const [configState, setConfigState] = useState<"pending" | "skipped" | "ready">(() => {
    const isShareLink = new URLSearchParams(window.location.search).has("share");
    if (hasSupabaseConfig() || isShareLink) return "ready";
    return isSupabaseSkipped() ? "skipped" : "pending";
  });

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
