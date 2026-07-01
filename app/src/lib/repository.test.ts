import { describe, it, expect } from "vitest";
import { createMemoryRepository, type Entity } from "./repository";

interface Note extends Entity {
  text: string;
}
type NoteInput = { text: string };

describe("createMemoryRepository", () => {
  it("create 分配 id 与 createdAt 并返回实体", async () => {
    const repo = createMemoryRepository<Note, NoteInput>({});
    const created = await repo.create({ text: "hello" });
    expect(created.id).toMatch(/[0-9a-f-]{36}/u);
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(created.text).toBe("hello");
  });

  it("findAll 返回全部,findById 命中或返回 null", async () => {
    const repo = createMemoryRepository<Note, NoteInput>({});
    const a = await repo.create({ text: "a" });
    await repo.create({ text: "b" });
    expect(await repo.findAll()).toHaveLength(2);
    expect((await repo.findById(a.id))?.text).toBe("a");
    expect(await repo.findById("missing")).toBeNull();
  });

  it("update 以不可变方式合并补丁,不改动已存对象", async () => {
    const repo = createMemoryRepository<Note, NoteInput>({});
    const a = await repo.create({ text: "old" });
    const updated = await repo.update(a.id, { text: "new" });
    expect(updated.text).toBe("new");
    expect(updated.id).toBe(a.id);
    expect(a.text).toBe("old"); // 原返回对象未被就地修改
  });

  it("update 不存在的 id 抛错", async () => {
    const repo = createMemoryRepository<Note, NoteInput>({});
    await expect(repo.update("nope", { text: "x" })).rejects.toThrow(/不存在|not found/i);
  });

  it("remove 删除对应实体", async () => {
    const repo = createMemoryRepository<Note, NoteInput>({});
    const a = await repo.create({ text: "a" });
    await repo.remove(a.id);
    expect(await repo.findById(a.id)).toBeNull();
  });

  it("返回值为副本,外部修改不污染仓储", async () => {
    const repo = createMemoryRepository<Note, NoteInput>({});
    const a = await repo.create({ text: "a" });
    a.text = "tampered";
    expect((await repo.findById(a.id))?.text).toBe("a");
  });

  it("create 前调用 validate 校验输入", async () => {
    const repo = createMemoryRepository<Note, NoteInput>({
      validate: (input) => {
        if (!input.text.trim()) throw new Error("text 不能为空");
        return input;
      },
    });
    await expect(repo.create({ text: "" })).rejects.toThrow(/不能为空/);
  });
});
