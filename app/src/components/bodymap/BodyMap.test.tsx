import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BodyMap } from "./BodyMap";
import { OVERLAY_ANTERIOR, OVERLAY_POSTERIOR } from "./regions";

function polygonArea(points: string): number {
  const nums = points.replace(/,/g, " ").split(/\s+/).map(Number);
  let area = 0;
  for (let i = 0; i < nums.length; i += 2) {
    const j = (i + 2) % nums.length;
    area += nums[i] * nums[j + 1] - nums[j] * nums[i + 1];
  }
  return Math.abs(area) / 2;
}

describe("BodyMap", () => {
  it("正面基准:渲染灰色人体与前后切换", () => {
    const { container } = render(<BodyMap value={[]} />);
    expect(screen.getByRole("tab", { name: "正面" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "背面" })).toBeTruthy();
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("前后视图手脚面积相近", () => {
    for (const r of ["left-hand", "right-hand", "left-foot", "right-foot"] as const) {
      const ant = OVERLAY_ANTERIOR.find((s) => s.region === r)!;
      const post = OVERLAY_POSTERIOR.find((s) => s.region === r)!;
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
    const onChange = vi.fn();
    render(<BodyMap value={[]} onChange={onChange} />);
    // 所有覆盖层多边形都是 checkbox,取第一个
    const cb = screen.getAllByRole("checkbox")[0];
    fireEvent.click(cb);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("交互:点击手部覆盖层触发确认", () => {
    const onChange = vi.fn();
    render(<BodyMap value={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "左手" }));
    expect(onChange).toHaveBeenCalledWith(["left-hand"]);
  });

  it("交互:已选标签可移除", () => {
    const onChange = vi.fn();
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
});
