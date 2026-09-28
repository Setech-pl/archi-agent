import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { convertDocument } from "../../src/runtime/convert-document.js";

const directory = mkdtempSync(path.join(tmpdir(), "archi-ux1-worker-test-"));
const slowWorker = path.join(directory, "slow.cjs");
writeFileSync(slowWorker, "while (true) {}\n");
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
});
