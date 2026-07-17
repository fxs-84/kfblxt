import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BodyMap } from "./BodyMap";
import { OVERLAY_ANTERIOR, OVERLAY_POSTERIOR, type BodyRegion } from "./regions";

function polygonArea(points: string): number {
  const nums = points.replace(/,/g, " ").split(/\s+/).map(Number);
  let area = 0;
  for (let i = 0; i < nums.length; i += 2) {
    const j = (i + 2) % nums.length;
    area += nums[i] * nums[j + 1] - nums[j] * nums[i + 1];
  }
  return Math.abs(area) / 2;
}

function centroidX(points: string): number {
  const nums = points.replace(/,/g, " ").split(/\s+/).map(Number);
  let sum = 0;
  let cnt = 0;
  for (let i = 0; i < nums.length; i += 2) {
    sum += nums[i];
    cnt++;
  }
  return cnt ? sum / cnt : 0;
}

const HAND_FOOT_LABELS = ["左手", "右手", "左足", "右足"] as const;
const HAND_FOOT_SET = new Set<string>(HAND_FOOT_LABELS);

describe("BodyMap", () => {
  it("正面基准:渲染灰色人体与前后切换", () => {
    const { container } = render(<BodyMap value={[]} />);
    expect(screen.getByRole("tab", { name: "正面" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "背面" })).toBeTruthy();
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("前后视图手脚面积相近", () => {
    for (const r of ["left-hand", "right-hand", "left-foot", "right-foot"] as const) {
      const ant = OVERLAY_ANTERIOR.find((s) => s.region === r);
      const post = OVERLAY_POSTERIOR.find((s) => s.region === r);
      expect(ant).toBeDefined();
      expect(post).toBeDefined();
      if (!ant || !post) return;
      const aA = polygonArea(ant.points);
      const pA = polygonArea(post.points);
      const ratio = Math.max(aA, pA) / Math.min(aA, pA);
      expect(ratio).toBeLessThan(1.35);
    }
  });

  it("展示模式:强度着色无交互控件", () => {
    render(<BodyMap value={["left-forearm-内侧"]} intensity={{ "left-forearm-内侧": 8 }} />);
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("交互:点击覆盖层多边形触发 onchange", () => {
    const onChange = vi.fn<(next: BodyRegion[]) => void>();
    render(<BodyMap value={[]} onChange={onChange} />);
    // 所有覆盖层多边形都是 checkbox,取第一个
    const cb = screen.getAllByRole("checkbox")[0];
    fireEvent.click(cb);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("交互:点击手部覆盖层触发确认", () => {
    const onChange = vi.fn<(next: BodyRegion[]) => void>();
    render(<BodyMap value={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "左手" }));
    expect(onChange).toHaveBeenCalledWith(["left-hand"]);
  });

  it("交互:已选标签可移除", () => {
    const onChange = vi.fn<(next: BodyRegion[]) => void>();
    render(<BodyMap value={["left-forearm-内侧"]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "移除 左前臂内侧" }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("切换到背面", () => {
    render(<BodyMap value={[]} onChange={vi.fn()} />);
    const back = screen.getByRole("tab", { name: "背面" });
    fireEvent.click(back);
    expect(back.getAttribute("aria-selected")).toBe("true");
  });

  it("正面五官只在正面显示", () => {
    const { container } = render(<BodyMap value={[]} />);
    expect(container.querySelector(".bodymap__face")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "背面" }));
    expect(container.querySelector(".bodymap__face")).toBeNull();
  });

  it("正面手足左右标记遵循前视方向", () => {
    render(<BodyMap value={[]} onChange={vi.fn()} />);
    for (const label of HAND_FOOT_LABELS) {
      const el = screen.getByRole("checkbox", { name: label });
      const cx = centroidX(el.getAttribute("points") ?? "");
      if (cx < 50) {
        expect(label).toMatch(/^右/);
      } else {
        expect(label).toMatch(/^左/);
      }
    }
  });

  it("背面手足左右标记遵循后视方向", () => {
    render(<BodyMap value={[]} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "背面" }));
    for (const label of HAND_FOOT_LABELS) {
      const el = screen.getByRole("checkbox", { name: label });
      const cx = centroidX(el.getAttribute("points") ?? "");
      if (cx < 50) {
        expect(label).toMatch(/^左/);
      } else {
        expect(label).toMatch(/^右/);
      }
    }
  });

  it("正面点击左侧手足应选中患者右侧区域", () => {
    const onChange = vi.fn<(next: BodyRegion[]) => void>();
    render(<BodyMap value={[]} onChange={onChange} />);
    const checkboxes = screen.getAllByRole("checkbox").filter((el) => {
      const name = el.getAttribute("aria-label") ?? "";
      return HAND_FOOT_SET.has(name);
    });
    const leftSide = checkboxes.filter((el) => centroidX(el.getAttribute("points") ?? "") < 50);
    expect(leftSide.length).toBeGreaterThanOrEqual(2);
    for (const el of leftSide) {
      fireEvent.click(el);
    }
    const selected = onChange.mock.calls.map((c) => c[0]).flat();
    expect(selected).toContain("right-hand");
    expect(selected).toContain("right-foot");
    expect(selected).not.toContain("left-hand");
    expect(selected).not.toContain("left-foot");
  });

  it("背面点击左侧手足应选中患者左侧区域", () => {
    const onChange = vi.fn<(next: BodyRegion[]) => void>();
    render(<BodyMap value={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("tab", { name: "背面" }));
    const checkboxes = screen.getAllByRole("checkbox").filter((el) => {
      const name = el.getAttribute("aria-label") ?? "";
      return HAND_FOOT_SET.has(name);
    });
    const leftSide = checkboxes.filter((el) => centroidX(el.getAttribute("points") ?? "") < 50);
    expect(leftSide.length).toBeGreaterThanOrEqual(2);
    for (const el of leftSide) {
      fireEvent.click(el);
    }
    const selected = onChange.mock.calls.map((c) => c[0]).flat();
    expect(selected).toContain("left-hand");
    expect(selected).toContain("left-foot");
    expect(selected).not.toContain("right-hand");
    expect(selected).not.toContain("right-foot");
  });

  it("切换视图后已选手足标记应翻到对侧", () => {
    // 在背面选中患者左足（后视 cx<50 为左侧）
    const onChange = vi.fn<(next: BodyRegion[]) => void>();
    const { rerender } = render(<BodyMap value={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("tab", { name: "背面" }));
    const backLeftFoot = screen.getByRole("checkbox", { name: "左足" });
    expect(centroidX(backLeftFoot.getAttribute("points") ?? "")).toBeLessThan(50);
    fireEvent.click(backLeftFoot);
    expect(onChange).toHaveBeenLastCalledWith(["left-foot"]);

    // 切回正面后，左足应位于对侧（cx≥50）
    rerender(<BodyMap value={["left-foot"]} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "正面" }));
    const frontLeftFoot = screen.getByRole("checkbox", { name: "左足" });
    expect(centroidX(frontLeftFoot.getAttribute("points") ?? "")).toBeGreaterThanOrEqual(50);
  });
});
