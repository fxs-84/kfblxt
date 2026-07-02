import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import "./styles/tokens.css";
import "./styles/layout.css";
import "./styles/print.css";
import { router } from "./app/router";

const basename = location.hostname.includes('github.io') ? '/-/' : '/';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} basename={basename} />
    </QueryClientProvider>
  </StrictMode>,
);
