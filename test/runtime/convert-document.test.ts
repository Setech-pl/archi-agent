import { syntheticDistribution } from "../support/distribution-profile.js";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { convertDocument } from "../../src/runtime/convert-document.js";

const directory = mkdtempSync(path.join(tmpdir(), "archi-ux1-worker-test-"));
const distributionDirectory=syntheticDistribution(path.join(directory,"distribution"));
const slowWorker = path.join(directory, "slow.cjs");
writeFileSync(slowWorker, "while (true) {}\n");
const ocrParent = path.join(directory, "ocr-parent.mjs");
writeFileSync(ocrParent, `export async function convertPdfIsolated(_file, { fullPage, signal, onStage }) {
  onStage?.('recognize');
  if (signal?.aborted) throw new Error('cancelled');
  if (fullPage) return { markdown: 'all', pages: [{ page: 1, source: "ocr" }] };
  return { markdown: 'auto', pages: [{ page: 1, source: "ocr" }] };
}\n`);
const failedOcrParent = path.join(directory, "failed-ocr-parent.mjs");
writeFileSync(failedOcrParent, "export async function convertPdfIsolated() { throw new Error('embedded-image-limit'); }\n");
afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe("one-request converter worker", () => {
  it("does not start a worker when already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await convertDocument("/unused.pdf", { signal: controller.signal, workerFile: "/missing.cjs" })).toEqual({ status: "cancelled" });
  });

  it("terminates a busy worker on timeout", async () => {
    const start = Date.now();
    expect(await convertDocument("/unused.pdf", { workerFile: slowWorker, timeoutMs: 40 })).toEqual({ status: "failed", code: "timeout" });
    expect(Date.now() - start).toBeLessThan(2000);
  });

  it("terminates a busy worker on Cancel", async () => {
    const controller = new AbortController();
    const work = convertDocument("/unused.pdf", { workerFile: slowWorker, signal: controller.signal });
    setTimeout(() => controller.abort(), 40);
    expect(await work).toEqual({ status: "cancelled" });
  });

  it("maps worker startup and crash to a closed code", async () => {
    expect(await convertDocument("/unused.pdf", { workerFile: "/missing.cjs" })).toEqual({ status: "failed", code: "conversion-failed" });
  });

  it("passes OCR mode and progress through the runtime and returns one complete result", async () => {
    const stages: string[] = [];
    expect(await convertDocument("/synthetic.pdf", { pdfOcrMode: "auto", distributionDirectory, ocrParentFile: ocrParent,
      onProgress: (stage) => stages.push(stage) })).toMatchObject({ status: "success", markdown: "auto", counts: { pages: 1 } });
    expect(await convertDocument("/synthetic.pdf", { pdfOcrMode: "all", distributionDirectory, ocrParentFile: ocrParent })).toMatchObject({ status: "success", markdown: "all" });
    expect(stages).toEqual(["recognize"]);
  });

  it("maps OCR failure safely and allows the next conversion", async () => {
    expect(await convertDocument("/synthetic.pdf", { pdfOcrMode: "auto", distributionDirectory, ocrParentFile: failedOcrParent }))
      .toEqual({ status: "failed", code: "embedded-image-limit" });
    const controller = new AbortController();
    controller.abort();
    expect(await convertDocument("/synthetic.pdf", { pdfOcrMode: "auto", distributionDirectory, ocrParentFile: ocrParent,
      signal: controller.signal })).toEqual({ status: "cancelled" });
    expect(await convertDocument("/synthetic.pdf", { pdfOcrMode: "auto", distributionDirectory, ocrParentFile: ocrParent }))
      .toMatchObject({ status: "success", markdown: "auto" });
  });
});

it("AUD-004 retains measured blank assessment, raster presence and empty OCR uncertainty", async () => {
  const parent = path.join(directory, "assessment-parent.mjs");
  writeFileSync(parent, `export async function convertPdfIsolated() { return { markdown: '## Page 1 (OCR)\\n\\n## Page 2 (blank)', pages: [{ page: 1, source: 'ocr', imageCount: 0, ocrText: 'empty' }, { page: 2, source: 'blank', imageCount: 0, blankAssessment: 'rendered-white' }] }; }`);
  const r = await convertDocument("/synthetic.pdf", { pdfOcrMode: "auto", distributionDirectory, ocrParentFile: parent });
  expect(r).toMatchObject({ status: "success", coverage: { pages: [{ page: 1, source: "ocr", imageCount: 0, ocrText: "empty" }, { page: 2, source: "blank", blankAssessment: "rendered-white" }], warnings: ["layout-not-preserved", "ocr-confidence-unavailable", "rendered-blank-not-proof", "ocr-no-text-recognized"] } });
});
