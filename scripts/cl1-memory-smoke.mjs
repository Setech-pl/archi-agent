import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import JSZip from "jszip";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
const bundleDir = path.join(root, "vscode-extension/dist");
const runtime = require(path.join(bundleDir, "archi-agent-runtime.js"));
const directory = mkdtempSync(path.join(tmpdir(), "archi-cl1-memory-"));

try {
  const archive = await JSZip.loadAsync(readFileSync(path.join(root, "test/fixtures/document-conversion/two-sheets.xlsx")));
  const xml = '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>';
  archive.file("xl/worksheets/sheet1.xml", xml + `<!--${"x".repeat(24 * 1024 * 1024 + 1 - Buffer.byteLength(xml) - 7)}-->`);
  const source = path.join(directory, "boundary.xlsx");
  const bytes = await archive.generateAsync({ type: "nodebuffer", compression: "STORE" });
  writeFileSync(source, bytes);
  const digest = createHash("sha256").update(bytes).digest("hex");
  let peak = process.memoryUsage().rss;
  const timer = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss); }, 5);
  let outcome;
  try {
    outcome = await runtime.convertDocument(source, { workerFile: path.join(bundleDir, "archi-agent-converter-worker.js") });
  } finally {
    clearInterval(timer);
  }
  peak = Math.max(peak, process.memoryUsage().rss);
  const unchanged = createHash("sha256").update(readFileSync(source)).digest("hex") === digest;
  console.log(JSON.stringify({ outcome, peakRssMiB: Math.ceil(peak / 1024 / 1024), unchanged }));
  if (outcome.status !== "failed" || outcome.code !== "archive-limit" || peak > 768 * 1024 * 1024 || !unchanged) process.exitCode = 1;
} finally {
  rmSync(directory, { recursive: true, force: true });
}
