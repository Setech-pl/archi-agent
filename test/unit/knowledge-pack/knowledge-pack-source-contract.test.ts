import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  knowledgePackFileNames,
  throwIfCancelled,
  validateRelativePath,
  type KnowledgePackSource,
  type ReadTextFileOptions
} from "../../../src/core/knowledge-pack/knowledge-pack-source.js";
import { KnowledgePackError } from "../../../src/core/knowledge-pack/source-errors.js";

const knowledgePackModules = [
  "source-limits.ts",
  "source-errors.ts",
  "knowledge-pack-source.ts",
  "markdown-table-parser.ts",
  "knowledge-pack.schema.ts",
  "front-matter.ts"
];

function moduleText(fileName: string): string {
  return readFileSync(new URL(`../../../src/core/knowledge-pack/${fileName}`, import.meta.url), "utf8");
}

function importSpecifiers(text: string): string[] {
  return text
    .split(String.fromCharCode(10))
    .filter((line) => line.startsWith("import ") || line.includes(" from "))
    .map((line) => {
      const quote = line.includes('"') ? '"' : "'";
      const parts = line.split(quote);
      return parts.length >= 3 ? parts[parts.length - 2] ?? "" : "";
    })
    .filter((specifier) => specifier.length > 0);
}

class InMemorySource implements KnowledgePackSource {
  public constructor(private readonly files: Readonly<Record<string, string>>) {}

  public async readTextFile(relativePath: string, options: ReadTextFileOptions = {}): Promise<string> {
    throwIfCancelled(options.signal);
    const check = validateRelativePath(relativePath);

    if (!check.ok) {
      throw new KnowledgePackError(check.issue);
    }

    const content = this.files[check.path];

    if (content === undefined) {
      throw new Error("missing");
    }

    return content;
  }

  public async listFiles(): Promise<readonly string[]> {
    return Object.keys(this.files).sort();
  }
}

describe("knowledge-pack source port", () => {
  it("names the five pack files", () => {
    expect([...knowledgePackFileNames]).toEqual(["systems.md", "actors.md", "relationships.md", "aliases.md", "rules.md"]);
  });

  it("accepts relative forward-slash paths", () => {
    expect(validateRelativePath("systems.md")).toEqual({ ok: true, path: "systems.md" });
    expect(validateRelativePath("pack/actors.md")).toEqual({ ok: true, path: "pack/actors.md" });
  });

  it("rejects absolute, traversing and malformed paths", () => {
    const backslash = String.fromCharCode(92);

    for (const path of [
      "",
      "/systems.md",
      "C:/pack/systems.md",
      "pack" + backslash + "systems.md",
      "../systems.md",
      "pack/../systems.md",
      "./systems.md",
      "pack//systems.md",
      "pack/",
      "stream:hidden",
      "pack" + String.fromCharCode(0) + ".md"
    ]) {
      const check = validateRelativePath(path);
      expect(check.ok).toBe(false);

      if (!check.ok) {
        expect(check.issue.code).toBe("invalid-path");
      }
    }
  });

  it("rejects over-long paths with the central limit", () => {
    const check = validateRelativePath("a".repeat(257));
    expect(check.ok).toBe(false);

    if (!check.ok) {
      expect(check.issue.code).toBe("limit-exceeded");
      expect(check.issue.limit).toBe(256);
    }

    expect(validateRelativePath("a".repeat(256)).ok).toBe(true);
  });

  it("supports cancellation through a minimal signal", async () => {
    const source = new InMemorySource({ "systems.md": "content" });
    await expect(source.readTextFile("systems.md")).resolves.toBe("content");
    await expect(source.readTextFile("systems.md", { signal: { aborted: true } })).rejects.toMatchObject({
      code: "cancelled"
    });
    await expect(source.readTextFile("../systems.md")).rejects.toMatchObject({ code: "invalid-path" });
    expect(() => throwIfCancelled(undefined)).not.toThrow();
  });

  it("keeps every knowledge-pack module free of platform imports", () => {
    for (const fileName of knowledgePackModules) {
      for (const specifier of importSpecifiers(moduleText(fileName))) {
        expect(specifier.startsWith("node:")).toBe(false);
        expect(specifier).not.toBe("vscode");
        expect(specifier === "zod" || specifier.startsWith("./") || specifier.startsWith("../")).toBe(true);
      }
    }
  });
});
