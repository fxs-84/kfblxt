/**
 * isPlaceholderSupabaseUrl — 占位符 Supabase URL 识别
 *
 * 背景:.env.local 里的模板值(如 https://your-project-ref.supabase.co)会被
 * resolveConfig 当成有效配置,导致全应用打到不存在的域名(ERR_NAME_NOT_RESOLVED),
 * 客户列表都加载不出来。本函数识别占位符,让应用正确回退单机模式。
 */

import { describe, it, expect } from "vitest";
import { isPlaceholderSupabaseUrl } from "./supabase";

describe("isPlaceholderSupabaseUrl", () => {
  it("识别 README 模板占位符 your-project-ref.supabase.co", () => {
    expect(isPlaceholderSupabaseUrl("https://your-project-ref.supabase.co")).toBe(true);
  });

  it("识别 example 域名", () => {
    expect(isPlaceholderSupabaseUrl("https://example.supabase.co")).toBe(true);
  });

  it("真实项目 ref 域名不是占位符", () => {
    expect(isPlaceholderSupabaseUrl("https://bydijxssezoetquounqo.supabase.co")).toBe(false);
  });

  it("undefined / 空串视为不可用", () => {
    expect(isPlaceholderSupabaseUrl(undefined)).toBe(true);
    expect(isPlaceholderSupabaseUrl("")).toBe(true);
  });

  it("非法 URL 视为不可用", () => {
    expect(isPlaceholderSupabaseUrl("not-a-url")).toBe(true);
  });
});