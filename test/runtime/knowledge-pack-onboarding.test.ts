import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanupStarterKnowledgePack, createStarterKnowledgePack, validateKnowledgePackDirectory, StarterPackCreateError } from "../../src/runtime/index.js";

const roots: string[] = [];
const system = { id: "invoice-service", canonicalName: "Invoice Service", kind: "service" as const,
  description: "Processes real invoices" };
function directory(): string {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "archi-ux3-")));
  roots.push(root);
  return path.join(root, ".archi-agent", "knowledge");
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("starter Knowledge Pack transaction", () => {
  it.each([false, true])("cleans failed five-file A without reporting a shared parent as its data (new directory=%s)", async (requireNewDirectory) => {
    const folderA = directory(), folderB = path.join(path.dirname(folderA), "other-knowledge");
    let completeB = false;
    await expect(createStarterKnowledgePack(folderA, system, { requireNewDirectory, onStep: async (step, file) => {
      if (step === "before-verify" && path.basename(file) === "rules.md") {
        await createStarterKnowledgePack(folderB, system, { requireNewDirectory }); completeB = true;
        throw new Error("injected A failure");
      }
    } })).rejects.toMatchObject({ code: "write-failed", cleanupIncomplete: false, recovery: "" });
    expect(completeB).toBe(true); expect(existsSync(folderA)).toBe(false);
    expect(readdirSync(path.dirname(folderA))).toEqual(["other-knowledge"]);
    expect((await validateKnowledgePackDirectory(folderB)).ok).toBe(true);
    expect(readFileSync(path.join(folderB, "systems.md"), "utf8")).toContain("invoice-service | Invoice Service");
  });
  it("creates missing project and Documents-style parents and removes only its own empty parents", async () => {
    const projectPack = directory();
    const documentsPack = path.join(path.dirname(path.dirname(projectPack)), "Documents", "ArchiAgent", "knowledge");
    const first = await createStarterKnowledgePack(projectPack, system);
    const second = await createStarterKnowledgePack(documentsPack, system);
    expect((await validateKnowledgePackDirectory(projectPack)).ok).toBe(true);
    expect((await validateKnowledgePackDirectory(documentsPack)).ok).toBe(true);
    await cleanupStarterKnowledgePack(first);
    await cleanupStarterKnowledgePack(second);
    expect(existsSync(path.dirname(projectPack))).toBe(false);
    expect(existsSync(path.join(path.dirname(path.dirname(projectPack)), "Documents"))).toBe(false);
  });

  it("creates in an existing empty destination and preserves that directory on cleanup", async () => {
    const folder = directory();
    mkdirSync(folder, { recursive: true });
    expect((await validateKnowledgePackDirectory(folder))).toMatchObject({ ok: false, code: "missing-file" });
    const receipt = await createStarterKnowledgePack(folder, system);
    expect((await validateKnowledgePackDirectory(folder)).ok).toBe(true);
    await cleanupStarterKnowledgePack(receipt);
    expect(existsSync(folder)).toBe(true);
    expect(existsSync(path.join(folder, "systems.md"))).toBe(false);
  });

  it("rejects a linked parent without writing into its target", async () => {
    const folder = directory();
    const project = path.dirname(path.dirname(folder));
    const target = path.join(project, "outside"); mkdirSync(target);
    symlinkSync(target, path.join(project, "linked"));
    await expect(createStarterKnowledgePack(path.join(project, "linked", "knowledge"), system))
      .rejects.toMatchObject({ code: "symbolic-link" });
    expect(existsSync(path.join(target, "knowledge"))).toBe(false);
  });

  it("creates five production-loader-valid files with only the first real system", async () => {
    const folder = directory();
    await createStarterKnowledgePack(folder, system);
    expect((await validateKnowledgePackDirectory(folder)).ok).toBe(true);
    expect(readFileSync(path.join(folder, "systems.md"), "utf8")).toContain("invoice-service | Invoice Service | service");
    expect(readFileSync(path.join(folder, "relationships.md"), "utf8")).not.toContain("invoice-service");
  });

  it("never overwrites an existing file and only removes files created by the failed attempt", async () => {
    const folder = directory();
    const first = await createStarterKnowledgePack(folder, system);
    const original = readFileSync(path.join(folder, "systems.md"), "utf8");
    await expect(createStarterKnowledgePack(folder, system)).rejects.toThrow();
    expect(readFileSync(path.join(folder, "systems.md"), "utf8")).toBe(original);
    expect((await validateKnowledgePackDirectory(folder)).ok).toBe(true);
    await cleanupStarterKnowledgePack(first);
  });

  it("rejects a nonempty target and preserves owner data", async () => {
    const folder = directory();
    mkdirSync(folder, { recursive: true });
    writeFileSync(path.join(folder, "actors.md"), "owner data\n");
    await expect(createStarterKnowledgePack(folder, system)).rejects.toMatchObject({ code: "location-exists" });
    expect(existsSync(path.join(folder, "systems.md"))).toBe(false);
    expect(readFileSync(path.join(folder, "actors.md"), "utf8")).toBe("owner data\n");
    expect(existsSync(folder)).toBe(true);
  });

  it("cleans its first file after a concurrent later collision and preserves the foreign file", async () => {
    const folder = directory(); mkdirSync(folder, { recursive: true });
    await expect(createStarterKnowledgePack(folder, system, { onStep: (step, file) => {
      if (step === "after-write" && path.basename(file) === "systems.md") writeFileSync(path.join(folder, "actors.md"), "owner data\n");
    } })).rejects.toMatchObject({ code: "location-exists" });
    expect(existsSync(path.join(folder, "systems.md"))).toBe(false);
    expect(readFileSync(path.join(folder, "actors.md"), "utf8")).toBe("owner data\n");
    expect(existsSync(folder)).toBe(true);
  });

  it("preserves a modified file and removes only the untouched siblings", async () => {
    const folder = directory();
    const receipt = await createStarterKnowledgePack(folder, system);
    writeFileSync(path.join(folder, "systems.md"), "owner change\n");
    await cleanupStarterKnowledgePack(receipt);
    expect(readFileSync(path.join(folder, "systems.md"), "utf8")).toBe("owner change\n");
    expect(existsSync(path.join(folder, "actors.md"))).toBe(false);
    expect(existsSync(folder)).toBe(true);
  });

  it.each(["after-open", "before-close", "before-verify"] as const)("cleans an owned file when %s fails", async (stage) => {
    const folder = directory();
    await expect(createStarterKnowledgePack(folder, system, { onStep: (step, file) => {
      if (step === stage && path.basename(file) === "systems.md") throw new Error("injected failure");
    } })).rejects.toMatchObject({ code: "write-failed" });
    expect(existsSync(folder)).toBe(false);
  });

  it("preserves an uncertain partial write after an injected write failure", async () => {
    const folder = directory();
    await expect(createStarterKnowledgePack(folder, system, { onStep: async (step, file, handle) => {
      if (step === "after-open" && path.basename(file) === "systems.md") {
        await handle.writeFile("partial", "utf8");
        throw new Error("injected partial write");
      }
    } })).rejects.toMatchObject({ code: "write-failed", cleanupIncomplete: true, recovery: expect.stringContaining("Inspect the chosen directory") });
    expect(readFileSync(path.join(folder, "systems.md"), "utf8")).toBe("partial");
  });

  it("handles a rejected close operation and cleans its file", async () => {
    const folder = directory();
    await expect(createStarterKnowledgePack(folder, system, { closeHandle: async () => {
      throw new Error("injected close failure");
    } })).rejects.toMatchObject({ code: "write-failed" });
    expect(existsSync(folder)).toBe(false);
  });

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)("preserves files when cleanup is denied and can clean after permissions recover", async () => {
    const folder = directory();
    const receipt = await createStarterKnowledgePack(folder, system);
    const before = readdirSync(folder).sort().map((name) => [name, readFileSync(path.join(folder, name), "utf8")]);
    chmodSync(folder, 0o500);
    try {
      expect(() => unlinkSync(path.join(folder, "systems.md"))).toThrow(/EACCES|EPERM/u);
      await cleanupStarterKnowledgePack(receipt);
      expect(readdirSync(folder).sort().map((name) => [name, readFileSync(path.join(folder, name), "utf8")])).toEqual(before);
    } finally { chmodSync(folder, 0o700); }
    await cleanupStarterKnowledgePack(receipt);
    expect(existsSync(folder)).toBe(false);
  });

  it("preserves a concurrently changed file after creation fails", async () => {
    const folder = directory();
    await expect(createStarterKnowledgePack(folder, system, { onStep: (step, file) => {
      if (step === "before-verify" && path.basename(file) === "systems.md") {
        writeFileSync(file, "owner change\n");
        throw new Error("injected read failure");
      }
    } })).rejects.toMatchObject({ code: "write-failed" });
    expect(readFileSync(path.join(folder, "systems.md"), "utf8")).toBe("owner change\n");
  });

  it("leaves a replacement empty directory untouched during cleanup", async () => {
    const folder = directory();
    const receipt = await createStarterKnowledgePack(folder, system);
    const moved = `${folder}-moved`;
    renameSync(folder, moved);
    mkdirSync(folder);
    await cleanupStarterKnowledgePack(receipt);
    expect(existsSync(folder)).toBe(true);
    expect(existsSync(path.join(moved, "systems.md"))).toBe(true);
  });
});
