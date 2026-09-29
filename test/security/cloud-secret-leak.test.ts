import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function filesBelow(root: string): string[] {
  if (!statSync(root).isDirectory()) return [root];
  return readdirSync(root).flatMap((name) => filesBelow(path.join(root, name)));
}

describe("cloud credential leak guard", () => {
  it("contains no realistic provider key in fixtures or packaged documentation", () => {
    const roots = [
      new URL("../fixtures", import.meta.url),
      new URL("../../vscode-extension/README.md", import.meta.url),
      new URL("../../docs/cloud-models.md", import.meta.url)
    ];
    const realisticKey = /sk-ant-api\d{2}-[A-Za-z0-9_-]{16,}|sk-or-v1-[A-Fa-f0-9]{16,}|sk-proj-[A-Za-z0-9_-]{16,}/;
    for (const root of roots) {
      for (const file of filesBelow(root.pathname)) {
        expect(readFileSync(file, "utf8"), file).not.toMatch(realisticKey);
      }
    }
  });
});
