/**
 * install_skill URL 候选生成单测 — 不打网络,只验逻辑
 */
import { describe, it, expect } from "vitest";
import { buildSkillUrlCandidates } from "./skill-system";

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
