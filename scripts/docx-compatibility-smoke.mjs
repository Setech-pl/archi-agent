#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Preparation runs in the repository; the smoke itself needs only Node and extracted bundles. */
export async function prepareDocxFixtures(folder, fixture) {
  const { default: JSZip } = await import("jszip");
  mkdirSync(folder, { recursive: true });
  const original = readFileSync(fixture);
  writeFileSync(path.join(folder, "structured.docx"), original);
  writeFileSync(path.join(folder, "corrupt.docx"), "synthetic corrupt DOCX");
  writeFileSync(path.join(folder, "oversized.docx"), Buffer.alloc(50 * 1024 * 1024 + 1));
  const document = text => `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${text}</w:body></w:document>`;
  const external = await JSZip.loadAsync(original);
  external.file("word/document.xml", document('<w:p><w:r><w:t>External image withheld</w:t></w:r><w:r><w:drawing><wp:inline><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:link="rExt"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>'));
  external.file("word/_rels/document.xml.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rExt" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="/synthetic/never-read-external.png" TargetMode="External"/></Relationships>');
  writeFileSync(path.join(folder, "external.docx"), await external.generateAsync({ type: "nodebuffer", compression: "STORE" }));
  const large = await JSZip.loadAsync(original);
  large.file("word/document.xml", document(`<w:p><w:r><w:t>${"X".repeat(8 * 1024 * 1024 + 1)}</w:t></w:r></w:p>`));
  writeFileSync(path.join(folder, "output-limit.docx"), await large.generateAsync({ type: "nodebuffer", compression: "STORE" }));
}

export async function runDocxSmoke(convert, folder) {
  const results = [];
  const check = async (id, file, verify) => {
    const source = path.join(folder, file);
    const digest = () => createHash("sha256").update(readFileSync(source)).digest("hex");
    const before = digest();
    try {
      const outcome = await convert(source);
      verify(outcome);
      assert.equal(digest(), before, "source changed");
      results.push({ id, layer: "packaged-runtime", status: "PASS", expected: "DOCX contract and source immutability", actual: outcome.status === "success" ? "success" : outcome.code });
    } catch (error) {
      results.push({ id, layer: "packaged-runtime", status: "FAIL", expected: "DOCX contract and source immutability", actual: error.name, errorCode: "docx-compatibility-failed" });
    }
  };
  await check("docx-structure-unicode", "structured.docx", r => {
    assert.equal(r.status, "success");
    for (const text of ["# Mission overview", "Żółw 🚀", "First item", "| Name | Value |"]) assert.ok(r.markdown.includes(text), text);
    assert.match(r.markdown, /^- +First item/mu);
  });
  await check("docx-corrupt", "corrupt.docx", r => assert.deepEqual(r, { status: "failed", code: "corrupt-document" }));
  await check("docx-input-limit", "oversized.docx", r => assert.deepEqual(r, { status: "failed", code: "input-too-large" }));
  await check("docx-output-limit", "output-limit.docx", r => assert.deepEqual(r, { status: "failed", code: "output-too-large" }));
  await check("docx-external-file-blocked", "external.docx", r => {
    assert.equal(r.status, "success");
    assert.equal(r.markdown, "External image withheld");
  });
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [bundle, worker, fixtures, report] = process.argv.slice(2);
  if (!report) throw new Error("usage: docx-compatibility-smoke.mjs <runtime.cjs> <worker.cjs> <fixtures> <report.json>");
  const runtime = createRequire(import.meta.url)(path.resolve(bundle));
  const results = await runDocxSmoke(file => runtime.convertDocument(file, { workerFile: path.resolve(worker) }), fixtures);
  writeFileSync(report, JSON.stringify({ results, cwd: process.cwd(), nodePath: process.env.NODE_PATH ?? "" }, null, 2) + "\n");
  console.log(`${results.filter(r => r.status === "PASS").length}/${results.length} DOCX scenarios PASS`);
  if (results.some(r => r.status !== "PASS")) process.exitCode = 1;
}
