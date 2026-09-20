import { describe, expect, it } from "vitest";
import { InMemoryKnowledgePackSource } from "../../../src/core/knowledge-pack/in-memory-knowledge-pack-source.js";
import { KnowledgePackError } from "../../../src/core/knowledge-pack/source-errors.js";

async function codeOf(action: Promise<unknown>): Promise<string | undefined> {
  try {
    await action;
    return undefined;
  } catch (error) {
    expect(error).toBeInstanceOf(KnowledgePackError);
    return (error as KnowledgePackError).code;
  }
}

describe("InMemoryKnowledgePackSource", () => {
  const source = new InMemoryKnowledgePackSource([
    ["systems.md", "# Systems"],
    ["notes/readme.txt", "żółw"]
  ]);

  it("lists and reads the given files", async () => {
    expect(await source.listFiles()).toEqual(["systems.md", "notes/readme.txt"]);
    expect(await source.readTextFile("systems.md")).toBe("# Systems");
  });

  it("follows the port contract for paths, missing files, byte limits and cancellation", async () => {
    expect(await codeOf(source.readTextFile("../systems.md"))).toBe("invalid-path");
    expect(await codeOf(source.readTextFile("actors.md"))).toBe("missing-file");
    expect(await codeOf(source.readTextFile("notes/readme.txt", { maxBytes: 4 }))).toBe("limit-exceeded");
    expect(await source.readTextFile("notes/readme.txt", { maxBytes: 7 })).toBe("żółw");
    expect(await codeOf(source.readTextFile("systems.md", { signal: { aborted: true } }))).toBe("cancelled");
    expect(await codeOf(source.listFiles({ signal: { aborted: true } }))).toBe("cancelled");
  });

  it("refuses unsafe or duplicate paths at construction", () => {
    expect(() => new InMemoryKnowledgePackSource([["/abs.md", ""]])).toThrow(Error);
    expect(
      () =>
        new InMemoryKnowledgePackSource([
          ["a.md", ""],
          ["a.md", ""]
        ])
    ).toThrow(Error);
  });
});
