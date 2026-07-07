/**
 * install_skill URL 候选生成 + 关键词搜索候选提取单测 — 不打网络,只验逻辑
 */
import { describe, it, expect } from "vitest";
import { buildSkillUrlCandidates, extractSearchResultUrls, installSkillFromUrl } from "./skill-system";

describe("buildSkillUrlCandidates", () => {
  it("普通 URL 原样返回", () => {
    expect(buildSkillUrlCandidates("https://example.com/skill.md"))
      .toContain("https://example.com/skill.md");
  });
  it("GitHub blob URL → raw.githubusercontent.com 形式", () => {
    const urls = buildSkillUrlCandidates(
      "https://github.com/owner/repo/blob/main/skills/foo.md",
    );
    expect(urls).toContain("https://raw.githubusercontent.com/owner/repo/main/skills/foo.md");
  });
  it("GitHub blob URL 多级路径", () => {
    const urls = buildSkillUrlCandidates(
      "https://github.com/owner/repo/blob/feature/x/skills/foo.md",
    );
    expect(urls).toContain("https://raw.githubusercontent.com/owner/repo/feature/x/skills/foo.md");
  });
  it("GitHub gist URL → gist.githubusercontent.com", () => {
    const urls = buildSkillUrlCandidates(
      "https://gist.github.com/user/abc123",
    );
    expect(urls).toContain("https://gist.githubusercontent.com/user/abc123/raw");
  });
  it("GitLab blob → raw 形式", () => {
    const urls = buildSkillUrlCandidates(
      "https://gitlab.com/owner/repo/-/blob/main/skills/foo.md",
    );
    expect(urls).toContain("https://gitlab.com/owner/repo/-/raw/main/skills/foo.md");
  });
  it("Gitea/Codeberg src/branch → raw/branch", () => {
    const urls = buildSkillUrlCandidates(
      "https://codeberg.org/owner/repo/src/branch/main/skill.md",
    );
    expect(urls).toContain("https://codeberg.org/owner/repo/raw/branch/main/skill.md");
  });
  it("任何域名都追加 /skill.md /SKILL.md /README.md 候选", () => {
    const urls = buildSkillUrlCandidates("https://example.com/foo");
    expect(urls).toContain("https://example.com/skill.md");
    expect(urls).toContain("https://example.com/SKILL.md");
    expect(urls).toContain("https://example.com/README.md");
  });
  it("去重", () => {
    const urls = buildSkillUrlCandidates("https://example.com/skill.md");
    const uniq = new Set(urls);
    expect(urls.length).toBe(uniq.size);
  });
  it("非法 URL 返回原值", () => {
    const urls = buildSkillUrlCandidates("not a url");
    expect(urls).toContain("not a url");
  });
  it("原 URL 永远是第一个候选", () => {
    const urls = buildSkillUrlCandidates("https://github.com/x/y/blob/main/z.md");
    expect(urls[0]).toBe("https://github.com/x/y/blob/main/z.md");
  });
});

describe("extractSearchResultUrls", () => {
  it("从 Bing 风格搜索结果里提取 URL", () => {
    const text = `# 搜索结果

1. [翻译助手](https://github.com/anthropic/skills/blob/main/translate.md) — 通用翻译
2. [数学解题](https://github.com/foo/bar/blob/main/math.md) — 数学
3. 无关条目`;
    const urls = extractSearchResultUrls(text);
    expect(urls).toContain("https://github.com/anthropic/skills/blob/main/translate.md");
    expect(urls).toContain("https://github.com/foo/bar/blob/main/math.md");
  });
  it("过滤掉非 markdown / 内部 / 锚点链接", () => {
    const text = `
- https://github.com/x/y/blob/main/a.md
- https://example.com/about
- https://github.com/x/y/blob/main/b.md#section
- /relative/path
- #anchor
`;
    const urls = extractSearchResultUrls(text);
    expect(urls).toContain("https://github.com/x/y/blob/main/a.md");
    expect(urls).not.toContain("https://example.com/about");
    expect(urls).not.toContain("#anchor");
    expect(urls).not.toContain("/relative/path");
  });
  it("识别 .md 直链", () => {
    const text = "看 https://raw.githubusercontent.com/x/y/main/skill.md 这个";
    const urls = extractSearchResultUrls(text);
    expect(urls).toContain("https://raw.githubusercontent.com/x/y/main/skill.md");
  });
  it("空字符串返回空数组", () => {
    expect(extractSearchResultUrls("")).toEqual([]);
  });
  it("优先 GitHub / GitLab / Codeberg 链接", () => {
    const text = `
随便写些文字
https://github.com/owner/repo/blob/main/skill.md
https://news.example.com/article/123
https://codeberg.org/x/y/src/branch/main/foo.md
`;
    const urls = extractSearchResultUrls(text);
    expect(urls[0]).toMatch(/github\.com|codeberg\.org/);
  });
});

describe("installSkillFromUrl — 非 URL 输入给出清晰指引", () => {
  it("纯中文关键词抛错并指引用户用 URL / Skill 库", async () => {
    await expect(installSkillFromUrl("翻译助手")).rejects.toThrow(/不是 URL/);
  });
  it("空字符串抛错", async () => {
    await expect(installSkillFromUrl("")).rejects.toThrow();
  });
  it("包含 GitHub 域名也算 URL,不走关键词分支", async () => {
    // 这里不期待成功(没网络),只期待不抛"不是 URL"错误
    try {
      await installSkillFromUrl("https://github.com/x/y/blob/main/z.md");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      expect(msg).not.toMatch(/不是 URL/);
    }
  });
});
