import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { Cdp, freePort, waitFor } from "./ux3-real-ui-smoke.mjs";
import { prepareVscode, vscodeBinary } from "./ux3-vscode-smoke.mjs";
const require = createRequire(import.meta.url), fixture = require("./art1-smoke-fixture.cjs");
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const ids = ["art1-menu-no-result", "art1-sequence-native-generation", "art1-visible-confirmation-and-cancel", "art1-palette-sequence-save", "art1-open-saved-report", "art1-component-native-generation-and-menu-save", "art1-existing-target-preserved", "art1-repeat-original-new-bundle", "art1-zero-save-provider-requests"];
export async function runArt1UiSmoke(vsix, out) {
  const results = [], evidence = [], logs = []; let cdp, child, environment, server; let calls = 0, component = false;
  async function check(id, fn) {
    try { await fn(); results.push({ id, layer: "native Mac ARM UI", status: "PASS" }); }
    catch (e) { const screenshot = path.join(out, `${id}-failure.png`); await cdp?.screenshot(screenshot).catch(() => {}); results.push({ id, layer: "native Mac ARM UI", status: "FAIL", error: e.message, screenshot }); throw e; }
  }
  const native = (file) => {
    const r = spawnSync("/usr/bin/swift", [fileURLToPath(new URL("./k3-native-picker.swift", import.meta.url)), String(child.pid), file], { encoding: "utf8", timeout: 45000 });
    evidence.push({ nativePath: file, exit: r.status, stdout: r.stdout, stderr: r.stderr }); assert.equal(r.status, 0, r.stderr);
  };
  const nativeConfirmation = (action) => {
    const r = spawnSync("/usr/bin/swift", [fileURLToPath(new URL("./art1-native-confirmation.swift", import.meta.url)), String(child.pid), action], { encoding: "utf8", timeout: 45000 });
    assert.equal(r.status, 0, r.stderr); const observed = JSON.parse(r.stdout); evidence.push(observed); return observed;
  };
  const clickButton = async (label, modal = false) => {
    if (modal) { nativeConfirmation(label); await delay(200); return; }
    const selector = modal ? ".dialog-box .monaco-button" : ".notification-list-item .monaco-button";
    const expression = `(() => { const buttons = Array.from(document.querySelectorAll(${JSON.stringify(selector)})).filter(b=>b.textContent.trim()===${JSON.stringify(label)} && b.getBoundingClientRect().height>0); const r=buttons.at(-1)?.getBoundingClientRect(); return r ? {x:r.x+r.width/2,y:r.y+r.height/2} : null; })()`;
    await waitFor(() => cdp.read(expression), `visible ${label}`);
    await delay(600);
    const point = await waitFor(() => cdp.read(expression), `stable ${label}`);
    evidence.push({ button: label, modal, point });
    await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...point });
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...point }); await delay(200);
  };
  const pickOriginal = async (type) => {
    await cdp.expectTitle("Archi Agent: choose original diagram result"); await cdp.text(type);
    const label = await waitFor(() => cdp.read('document.querySelector(".quick-input-list .monaco-list-row.focused .label-name")?.textContent'), "original result label");
    assert.ok(label.startsWith(type)); await cdp.chooseLabel(label);
  };
  const chooseFlow = async (flow) => {
    await cdp.expectTitle("Archi Agent: flow source"); await cdp.text("Choose a flow file");
    const label = await waitFor(() => cdp.read('document.querySelector(".quick-input-list .monaco-list-row.focused .label-name")?.textContent'), "flow file row");
    await cdp.chooseLabel(label); native(flow);
  };
  const confirmation = async () => {
    const observed = nativeConfirmation("inspect");
    const detail = observed.texts.find((text) => text.includes("diagram.puml") && text.includes("report.json"));
    assert.ok(detail.includes("diagram.puml")); assert.ok(detail.includes("report.json")); assert.ok(detail.includes("Existing results are never overwritten"));
    const folder = detail.split("\n")[0].trim(); assert.ok(path.isAbsolute(folder)); return folder;
  };
  try {
    environment = prepareVscode(vsix, "ART1-real-ui"); const project = path.join(environment.root, "synthetic-project"); mkdirSync(project);
    const { pack, flow } = fixture.prepare(project), resultRoot = path.join(project, "archi-agent-results");
    server = createServer((req, res) => { let body = ""; req.on("data", (b) => body += b); req.on("end", () => {
      calls++; const value = fixture.answer(JSON.parse(JSON.parse(body).messages[1].content), component);
      res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }] }));
    }); }); await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const settingsPath = path.join(environment.user, "User/settings.json"), settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    Object.assign(settings, { "archiAgent.knowledgePackPath": pack, "archiAgent.localModel.baseUrl": `http://127.0.0.1:${server.address().port}/v1`, "archiAgent.localModel.model": "synthetic-art1" }); writeFileSync(settingsPath, JSON.stringify(settings));
    const port = await freePort();
    child = spawn(vscodeBinary, ["--user-data-dir", environment.user, "--extensions-dir", environment.extensions, `--remote-debugging-port=${port}`, "--skip-welcome", "--skip-release-notes", "--new-window", project], { stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (b) => logs.push(b)); child.stderr.on("data", (b) => logs.push(b));
    const target = await waitFor(async () => { try { return (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((i) => i.type === "page" && /workbench/u.test(i.url)); } catch { return undefined; } }, "renderer", 20000);
    const socket = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r, j) => { socket.addEventListener("open", r, { once: true }); socket.addEventListener("error", j, { once: true }); }); cdp = new Cdp(socket); await delay(2500);
    await check(ids[0], async () => { await cdp.palette("Archi Agent: Open"); await cdp.pick("Archi Agent", "Save Diagram and Report");
      await waitFor(() => cdp.read('Array.from(document.querySelectorAll(".notification-list-item-message")).some(e=>e.textContent.includes("no completed diagram"))'), "no result instruction"); assert.equal(calls, 0); });
    await check(ids[1], async () => { await cdp.palette("Archi: Create Diagram"); await cdp.pick("Archi Agent: diagram type", "Sequence");
      await chooseFlow(flow);
      await waitFor(() => cdp.read('Array.from(document.querySelectorAll(".notification-list-item-message")).some(e=>e.textContent.includes("Archi Agent generated"))'), "generation success"); assert.equal(calls, 2);
    });
    await check(ids[2], async () => { await clickButton("Save Diagram and Report"); const dir = await confirmation();
      evidence.push({ visibleDestination: dir, files: ["diagram.puml", "report.json"] }); await cdp.screenshot(path.join(out, "art1-confirmation.png"));
      await clickButton("Cancel", true); assert.ok(!existsSync(resultRoot)); assert.equal(calls, 2); });
    let sequenceDir, sequenceReport;
    await check(ids[3], async () => { await cdp.palette("Archi Agent: Save Diagram and Report"); await pickOriginal("sequence"); sequenceDir = await confirmation(); await clickButton("Save Diagram and Report", true);
      await waitFor(() => existsSync(path.join(sequenceDir, "report.json")), "saved sequence report");
      sequenceReport = JSON.parse(readFileSync(path.join(sequenceDir, "report.json"))); const bytes = readFileSync(path.join(sequenceDir, "diagram.puml"));
      assert.equal(sequenceReport.diagram.sha256, createHash("sha256").update(bytes).digest("hex")); assert.equal(sequenceReport.diagram.byteLength, bytes.length);
      assert.equal(sequenceReport.diagramType, "sequence"); assert.equal(calls, 2); assert.equal(readdirSync(sequenceDir).length, 2); await cdp.screenshot(path.join(out, "art1-sequence-saved.png"));
    });
    await check(ids[4], async () => { await clickButton("Open Report"); await waitFor(() => cdp.read('Array.from(document.querySelectorAll(".view-line")).some(e=>e.textContent.includes("archi-agent-artifact"))'), "opened report tab"); });
    await check(ids[5], async () => { component = true; await cdp.palette("Archi: Create Diagram"); await cdp.pick("Archi Agent: diagram type", "Component");
      await chooseFlow(flow); await waitFor(() => calls === 4, "two component requests"); await delay(700);
      await cdp.palette("Archi Agent: Open"); await cdp.pick("Archi Agent", "Save Diagram and Report"); await pickOriginal("component");
      const dir = await confirmation(); await clickButton("Save Diagram and Report", true); await waitFor(() => existsSync(path.join(dir, "report.json")), "component bundle");
      const report = JSON.parse(readFileSync(path.join(dir, "report.json"))); assert.equal(report.diagramType, "component"); assert.equal(report.diagram.sha256, createHash("sha256").update(readFileSync(path.join(dir, "diagram.puml"))).digest("hex")); assert.equal(calls, 4); await cdp.screenshot(path.join(out, "art1-component-saved.png"));
    });
    await check(ids[6], async () => { await cdp.palette("Archi Agent: Save Diagram and Report"); await pickOriginal("sequence"); const dir = await confirmation(); mkdirSync(dir); writeFileSync(path.join(dir, "foreign.txt"), "keep");
      await clickButton("Save Diagram and Report", true); await waitFor(() => cdp.read('Array.from(document.querySelectorAll(".notification-list-item-message")).some(e=>e.textContent.includes("location-exists"))'), "collision message");
      assert.deepEqual(readdirSync(dir), ["foreign.txt"]); assert.equal(readFileSync(path.join(dir, "foreign.txt"), "utf8"), "keep"); assert.equal(calls, 4);
    });
    await check(ids[7], async () => { await cdp.palette("Archi Agent: Save Diagram and Report"); await pickOriginal("sequence"); const dir = await confirmation(); assert.notEqual(dir, sequenceDir); await clickButton("Save Diagram and Report", true);
      await waitFor(() => existsSync(path.join(dir, "report.json")), "repeat bundle"); const report = JSON.parse(readFileSync(path.join(dir, "report.json")));
      assert.equal(report.resultId, sequenceReport.resultId); assert.notEqual(report.bundleId, sequenceReport.bundleId); assert.equal(calls, 4);
    });
    await check(ids[8], async () => { assert.equal(calls, 4); });
  } catch (e) { for (const id of ids.filter((id) => !results.some((r) => r.id === id))) results.push({ id, layer: "native Mac ARM UI", status: "NOT_RUN", error: e.message }); }
  finally { cdp?.socket.close(); if (child && child.exitCode === null) { child.kill("SIGTERM"); await delay(1500); } if (server) { server.closeAllConnections(); await new Promise((r) => server.close(r)); }
    writeFileSync(path.join(out, "art1-real-ui.log"), Buffer.concat(logs)); writeFileSync(path.join(out, "art1-real-ui.json"), JSON.stringify({ testRoot: environment?.root, requests: calls, platform: process.platform, arch: process.arch, evidence, results }, null, 2) + "\n"); }
  return results;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) { const results = await runArt1UiSmoke(path.resolve(process.argv[2]), path.resolve(process.argv[3])); console.log(JSON.stringify(results, null, 2)); if (results.some((r) => r.status !== "PASS")) process.exitCode = 1; }
