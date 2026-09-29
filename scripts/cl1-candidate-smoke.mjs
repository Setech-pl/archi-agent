import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openVsix } from "../vscode-extension/scripts/vsix-zip.mjs";

const [vsixPath, fixtureDir] = process.argv.slice(2);
if (!vsixPath || !fixtureDir) throw new Error("usage: node scripts/cl1-candidate-smoke.mjs <candidate.vsix> <fixture-directory>");
const directory = mkdtempSync(path.join(tmpdir(), "archi-cl1-candidate-"));
const bundles = path.join(directory, "dist");
mkdirSync(bundles);

try {
  const archive = openVsix(path.resolve(vsixPath));
  for (const name of ["archi-agent-runtime.js", "archi-agent-converter-worker.js"]) {
    writeFileSync(path.join(bundles, name), archive.read(`extension/dist/${name}`));
  }
  const runtime = createRequire(import.meta.url)(path.join(bundles, "archi-agent-runtime.js"));
  const outcomes = {};
  for (const name of ["large.pdf", "large.docx", "large.xlsx", "over-limit.pdf"]) {
    const source = path.join(fixtureDir, name);
    const before = createHash("sha256").update(readFileSync(source)).digest("hex");
    const result = await runtime.convertDocument(source, { workerFile: path.join(bundles, "archi-agent-converter-worker.js") });
    const after = createHash("sha256").update(readFileSync(source)).digest("hex");
    outcomes[name] = { status: result.status, code: result.code, unchanged: before === after };
  }
  const controller = new AbortController();
  controller.abort();
  outcomes.cancel = await runtime.convertDocument(path.join(fixtureDir, "large.xlsx"), { signal: controller.signal, workerFile: path.join(bundles, "archi-agent-converter-worker.js") });
  console.log(JSON.stringify(outcomes));
  if (["large.pdf", "large.docx", "large.xlsx"].some((name) => outcomes[name].status !== "success" || !outcomes[name].unchanged) ||
      outcomes["over-limit.pdf"].code !== "input-too-large" || !outcomes["over-limit.pdf"].unchanged || outcomes.cancel.status !== "cancelled") process.exitCode = 1;
} finally {
  rmSync(directory, { recursive: true, force: true });
}
