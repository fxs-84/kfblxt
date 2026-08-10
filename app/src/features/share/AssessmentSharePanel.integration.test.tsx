/**
 * AssessmentSharePanel — 集成测试(不 mock 数据层)
 *
 * 目的:证明"二维码真的生成" — 用真实的 localStorage 仓储、
 * 真实的 React Query hooks、真实的 qrcode.react 渲染,验证:
 *   1. 勾选量表 → 点生成 → 分享卡片 + 真实 SVG 二维码出现在 DOM
 *   2. 生成失败(Supabase 迁移未跑导致 shares.mode 列不存在)→ 错误可见
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AssessmentSharePanel } from "./AssessmentSharePanel";

vi.mock("../../lib/supabase", () => ({
  getSupabase: vi.fn(),
}));

import { getSupabase } from "../../lib/supabase";
import { shareRepository } from "./share.repository";

function renderPanel() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <AssessmentSharePanel encounterId="e-1" patientId="p-1" />
    </QueryClientProvider>,
  );
}

describe("AssessmentSharePanel 集成(真实仓储 + 真实 QR)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    // 默认无 Supabase → 走 localStorage 模式
    (getSupabase as ReturnType<typeof vi.fn>).mockReturnValue(null);
    // 清空 lazyPersistent 单例的内存数据(跨测试隔离,否则记录会串)
    const all = await shareRepository.findAll();
    for (const r of all) await shareRepository.remove(r.id);
  });

  it("勾选脑区量表 → 生成 → 分享卡片出现且真实 SVG 二维码渲染进 DOM", async () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /生成量表二维码/ }));
    fireEvent.click(screen.getByTestId("scale-option-brain_region").querySelector("input") as HTMLInputElement);
    fireEvent.click(screen.getByTestId("generate-assessment-share-btn"));

    // 等待分享卡片出现(真实仓储异步 + 查询失效重取)
    await waitFor(() => {
      expect(screen.getByTestId(/assessment-share-url-/)).toBeInTheDocument();
    }, { timeout: 3000 });

    // 关键断言:真实 QRCodeSVG 渲染出 SVG,且内部有 path(真实二维码图形)
    const svg = document.querySelector(".share-card__qr svg");
    expect(svg).not.toBeNull();
    const paths = svg?.querySelectorAll("path");
    expect(paths ? paths.length : 0).toBeGreaterThan(0);

    // URL 是 ?share=<token> 形态
    const urlInput = screen.getByTestId(/assessment-share-url-/) as HTMLInputElement;
    expect(urlInput.value).toMatch(/share=/);
    expect(urlInput.value).not.toContain("undefined");
  });

  it("勾选两个量表 → 生成 → URL 相同卡片只出现一张(组合进同一个 token)", async () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /生成量表二维码/ }));
    fireEvent.click(screen.getByTestId("scale-option-brain_region").querySelector("input") as HTMLInputElement);
    fireEvent.click(screen.getByTestId("scale-option-pain_assessment").querySelector("input") as HTMLInputElement);
    fireEvent.click(screen.getByTestId("generate-assessment-share-btn"));

    await waitFor(() => {
      expect(screen.getAllByTestId(/assessment-share-url-/)).toHaveLength(1);
    }, { timeout: 3000 });
  });

  it("生成失败(Supabase 迁移未跑:shares.mode 列不存在)→ 错误信息可见", async () => {
    // 模拟用户配置了 Supabase,但 migration 0012 未执行 → insert 报列不存在
    (getSupabase as ReturnType<typeof vi.fn>).mockReturnValue({
      from: () => ({
        insert: () => ({
          error: { message: 'column "mode" of relation "shares" does not exist' },
        }),
      }),
    });

    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /生成量表二维码/ }));
    fireEvent.click(screen.getByTestId("scale-option-brain_region").querySelector("input") as HTMLInputElement);
    fireEvent.click(screen.getByTestId("generate-assessment-share-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("generate-error")).toBeInTheDocument();
    }, { timeout: 3000 });
    expect(screen.getByTestId("generate-error").textContent).toContain("mode");
  });
});