import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Cdp, freePort, waitFor } from "./ux3-real-ui-smoke.mjs";
import { prepareVscode, vscodeBinary } from "./ux3-vscode-smoke.mjs";
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const ids = ["k3-menu-and-native-documents", "k3-palette-and-initial-pending", "k3-edit-and-group-accept", "k3-native-parent-and-preview", "k3-save-without-activation", "k3-save-and-use", "k3-review-cancel", "k3-controlled-input-error-zero-request", "k3-zero-additional-review-save-generation"];
export async function runK3UiSmoke(vsix, out, projectParent) {
  const results = [], evidence = [], logs = []; let cdp, child, environment, server; let calls = 0;
  const native = async (destination) => {
    const result = spawnSync("/usr/bin/swift", [fileURLToPath(new URL("./k3-native-picker.swift", import.meta.url)), String(child.pid), destination], { encoding: "utf8", timeout: 45000 });
    evidence.push({ nativePath: destination, exit: result.status, stdout: result.stdout, stderr: result.stderr });
    if (result.status !== 0) throw new Error(`native picker failed: ${result.stderr}`);
    // Let NSOpenPanel finish its close animation before bringing the renderer forward.
    await delay(500);
  };
  async function check(id, fn) {
    try { await fn(); results.push({ id, layer: "real-ui", status: "PASS" }); }
    catch (e) { const screenshot = path.join(out, `${id}-failure.png`); await cdp?.screenshot(screenshot).catch(() => {}); results.push({ id, layer: "real-ui", status: "FAIL", error: e.message, screenshot }); throw e; }
  }
  try {
    environment = prepareVscode(vsix, "K3-real-ui");
    // ART1 may supply a canonical evidence directory: NSOpenPanel can return /tmp aliases.
    const project = projectParent ? path.join(projectParent, `k3-native-project-${path.basename(environment.root)}`) : path.join(environment.root, "synthetic-project"); mkdirSync(project);
    const source = path.join(project, "source.md"); writeFileSync(source, "Alpha calls Beta.");
    server = createServer((req, res) => {
      let body = ""; req.on("data", (b) => { body += b; }); req.on("end", () => {
        calls++; const s = JSON.parse(JSON.parse(body).messages[1].content).sources[0];
        const evidence = [{ sourceId: s.sourceId, originalDigest: s.originalDigest, textDigest: s.textDigest, excerpt: s.text, startOffset: 0, endOffset: s.text.length }];
        const candidates = [
          { table: "systems", row: { id: "a", canonical_name: "Alpha", kind: "service", description: "Service" }, basis: "explicit", reasoning: null, evidence },
          { table: "systems", row: { id: "b", canonical_name: "Beta", kind: "database", description: "Store" }, basis: "inferred", reasoning: "Proposed", evidence }
        ];
        res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ version: 1, candidates }) } }] }));
      });
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const settingsPath = path.join(environment.user, "User/settings.json");
    const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    Object.assign(settings, { "archiAgent.localModel.baseUrl": `http://127.0.0.1:${server.address().port}/v1`, "archiAgent.localModel.model": "synthetic-k3" });
    writeFileSync(settingsPath, JSON.stringify(settings));
    const port = await freePort();
    child = spawn(vscodeBinary, ["--user-data-dir", environment.user, "--extensions-dir", environment.extensions, `--remote-debugging-port=${port}`, "--skip-welcome", "--skip-release-notes", "--new-window", project], { stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (b) => logs.push(b)); child.stderr.on("data", (b) => logs.push(b));
    const target = await waitFor(async () => { try { return (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((i) => i.type === "page" && /workbench/u.test(i.url)); } catch { return undefined; } }, "renderer", 20000);
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r, j) => { socket.addEventListener("open", r, { once: true }); socket.addEventListener("error", j, { once: true }); });
    cdp = new Cdp(socket); await delay(2500);
    const reviewTitle = "Archi Agent: review Knowledge Pack candidates", previewTitle = "Archi Agent: preview new Knowledge Pack";
    // Keyboard acceptance avoids an old row's mouse release dismissing its replacement
    // when a choice opens an editor before showing the next picker.
    const choose = async (label) => {
      await waitFor(() => cdp.read(`document.activeElement?.matches(".quick-input-widget input") && document.querySelector(".quick-input-list .monaco-list-row.focused .label-name")?.textContent === ${JSON.stringify(label)}`), "focused choice");
      await cdp.key("Enter", "Enter"); await delay(200);
    };
    const pick = async (title, label) => {
      await cdp.expectTitle(title); await cdp.text(label); await choose(label);
    };
    const api = createRequire(import.meta.url)(path.join(environment.extensionRoot, "dist/archi-agent-runtime.js"));
    await check(ids[0], async () => {
      await cdp.palette("Archi Agent: Open"); await pick("Archi Agent", "Knowledge Management");
      await pick("Archi Agent: Knowledge Management", "Build Knowledge Pack from Documents");
      await native(source); await cdp.expectTitle(reviewTitle); assert.equal(calls, 1);
      await pick(reviewTitle, "Cancel");
    });
    await check(ids[1], async () => {
      await cdp.palette("Archi Agent: Build Knowledge Pack from Documents"); await native(source);
      await cdp.expectTitle(reviewTitle);
      assert.match(await cdp.read('document.querySelector(".quick-input-widget input")?.placeholder'), /2 pending/u);
      await cdp.screenshot(path.join(out, "k3-pending.png")); assert.equal(calls, 2);
    });
    await check(ids[2], async () => {
      await pick(reviewTitle, "Show review details"); await cdp.expectTitle(reviewTitle);
      await pick(reviewTitle, "Edit candidate"); await cdp.expectTitle("Archi Agent: edit candidate"); await cdp.text("Beta");
      const label = await waitFor(() => cdp.read('(() => { const label = document.querySelector(".quick-input-list .monaco-list-row.focused .label-name")?.textContent; return label?.includes("Beta") ? label : undefined; })()'), "Beta row");
      await choose(label); await pick("Archi Agent: candidate field", "description");
      await cdp.enter("Archi Agent: edit description", "Edited synthetic store | data"); await cdp.expectTitle(reviewTitle);
      await pick(reviewTitle, "Accept all pending"); await pick(reviewTitle, "Validate and preview");
    });
    await check(ids[3], async () => {
      await native(project); await cdp.enter("Archi Agent: new pack folder name", "pack-save"); await cdp.expectTitle(previewTitle);
      await pick(previewTitle, "Show summary and additions"); await cdp.expectTitle(previewTitle);
      await pick(previewTitle, "systems.md"); await cdp.expectTitle(previewTitle);
      await cdp.screenshot(path.join(out, "k3-preview.png")); assert.equal(calls, 2);
    });
    const destination = path.join(project, "pack-save"), settingFile = path.join(project, ".vscode/settings.json");
    await check(ids[4], async () => {
      await pick(previewTitle, "Save"); await waitFor(() => existsSync(path.join(destination, "rules.md")), "saved five files");
      assert.equal(readdirSync(destination).length, 5); assert.deepEqual(await api.validateKnowledgePackDirectory(destination), { ok: true });
      assert.match(readFileSync(path.join(destination, "systems.md"), "utf8"), /Edited synthetic store/u);
      assert.ok(!existsSync(settingFile) || !JSON.parse(readFileSync(settingFile, "utf8"))["archiAgent.knowledgePackPath"]);
    });
    await check(ids[5], async () => {
      await cdp.palette("Archi Agent: Build Knowledge Pack from Documents"); await native(source); await pick(reviewTitle, "Accept all pending");
      await pick(reviewTitle, "Validate and preview"); await native(project); await cdp.enter("Archi Agent: new pack folder name", "pack-use");
      await pick(previewTitle, "Save and use");
      await waitFor(() => existsSync(settingFile) && JSON.parse(readFileSync(settingFile, "utf8"))["archiAgent.knowledgePackPath"] === path.join(project, "pack-use"), "activated new pack");
      assert.deepEqual(await api.validateKnowledgePackDirectory(path.join(project, "pack-use")), { ok: true });
    });
    await check(ids[6], async () => {
      const before = readFileSync(settingFile, "utf8"); await cdp.palette("Archi Agent: Build Knowledge Pack from Documents"); await native(source);
      await pick(reviewTitle, "Cancel"); assert.equal(readFileSync(settingFile, "utf8"), before); assert.equal(calls, 4);
    });
    await check(ids[7], async () => {
      const invalid = path.join(project, "invalid.md"); writeFileSync(invalid, Buffer.from([0xff])); const before = calls;
      await cdp.palette("Archi Agent: Build Knowledge Pack from Documents"); await native(invalid);
      await waitFor(() => cdp.read('Array.from(document.querySelectorAll(".notification-list-item-message")).some(e=>e.textContent.includes("Knowledge Pack build failed"))'), "controlled input error");
      assert.equal(calls, before); await cdp.screenshot(path.join(out, "k3-input-error.png"));
    });
    await check(ids[8], async () => { assert.equal(calls, 4); });
  } catch (e) {
    for (const id of ids.filter((id) => !results.some((r) => r.id === id))) results.push({ id, layer: "real-ui", status: "NOT_RUN", error: e.message });
  } finally {
    cdp?.socket.close(); if (child && child.exitCode === null) { child.kill("SIGTERM"); await delay(1500); }
    if (server) { server.closeAllConnections(); await new Promise((r) => server.close(r)); }
    writeFileSync(path.join(out, "k3-real-ui.log"), Buffer.concat(logs));
    writeFileSync(path.join(out, "k3-real-ui.json"), JSON.stringify({ testRoot: environment?.root, requests: calls, evidence, results }, null, 2) + "\n");
  }
  return results;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const results = await runK3UiSmoke(path.resolve(process.argv[2]), path.resolve(process.argv[3])); console.log(JSON.stringify(results, null, 2));
  if (results.some((r) => r.status !== "PASS")) process.exitCode = 1;
}
