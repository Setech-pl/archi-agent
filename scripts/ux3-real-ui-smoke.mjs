// Drive the installed candidate's visible controls. No editor API stubs or test commands.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:net";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareVscode, vscodeBinary } from "./ux3-vscode-smoke.mjs";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export async function waitFor(fn, label, timeout = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = await fn();
    if (result) return result;
    await delay(100);
  }
  throw new Error(`UI timeout: ${label}`);
}
export async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
export class Cdp {
  constructor(socket) {
    this.socket = socket; this.sequence = 0; this.pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const entry = this.pending.get(message.id);
      if (entry) { this.pending.delete(message.id); clearTimeout(entry.timer);
        message.error ? entry.reject(new Error(message.error.message)) : entry.resolve(message.result); }
    });
  }
  async send(method, params = {}) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 10000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async read(expression) {
    const result = await this.send("Runtime.evaluate", { expression, returnByValue: true });
    if (result.exceptionDetails) throw new Error(`UI DOM inspection failed: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`);
    return result.result.value;
  }
  async key(key, code, modifiers = 0) {
    if (modifiers & 4) await this.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Meta", code: "MetaLeft", modifiers: 4 });
    if (modifiers & 8) await this.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Shift", code: "ShiftLeft", modifiers });
    await this.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, modifiers, windowsVirtualKeyCode: key === "Enter" ? 13 : key === "Escape" ? 27 : undefined });
    await this.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, modifiers });
    if (modifiers & 8) await this.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Shift", code: "ShiftLeft", modifiers: modifiers & ~8 });
    if (modifiers & 4) await this.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Meta", code: "MetaLeft", modifiers: 0 });
  }
  async text(value) {
    await this.key("a", "KeyA", 4);
    await this.send("Input.insertText", { text: value });
  }
  async title() { return this.read('document.querySelector(".quick-input-widget")?.offsetParent !== null ? document.querySelector(".quick-input-title")?.textContent ?? "" : ""'); }
  async focused() { return this.read('document.activeElement?.matches(".quick-input-widget input") ?? false'); }
  async expectTitle(title) {
    await this.send("Page.bringToFront");
    await waitFor(async () => (await this.title()) === title && await this.focused(), title);
    await delay(250);
    assert.equal(await this.title(), title);
  }
  async enter(title, value) {
    await this.expectTitle(title);
    await this.text(value);
    await waitFor(() => this.read(`document.activeElement?.value === ${JSON.stringify(value)}`), "input value");
    await this.key("Enter", "Enter");
    await delay(150);
  }
  async chooseLabel(value) {
    await waitFor(() => this.read(`(() => {
      const focused = document.querySelector(".quick-input-list .monaco-list-row.focused .label-name");
      return focused?.getBoundingClientRect().height > 0 && focused.textContent === ${JSON.stringify(value)};
    })()`), `filtered list item ${value}`);
    const point = await this.read(`(() => {
      const row = document.querySelector(".quick-input-list .monaco-list-row.focused .label-name").getBoundingClientRect();
      return { x: row.x + row.width / 2, y: row.y + row.height / 2 };
    })()`);
    await this.send("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...point });
    await this.send("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...point });
    await delay(150);
  }
  async pick(title, value) { await this.expectTitle(title); await this.text(value); await this.chooseLabel(value); }
  async palette(command) {
    await this.send("Page.bringToFront");
    await waitFor(() => this.read('(document.querySelector(".quick-input-widget")?.offsetParent ?? null) === null'), "previous control closed");
    await delay(150);
    await this.key("P", "KeyP", 12);
    await waitFor(async () => await this.focused() && await this.read('document.activeElement?.value === ">"'), "command palette");
    await this.text(`>${command}`);
    await this.chooseLabel(command);
  }
  async screenshot(destination) {
    const screenshot = await this.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(destination, Buffer.from(screenshot.data, "base64"));
  }
}
const uiIds = ["palette-configure", "menu-configuration", "menu-knowledge", "create-new-system", "create-empty-service",
  "create-database", "create-queue", "create-external", "native-folder-picker", "reopen-configure", "generate-valid-pack-cancel", "onboarding-zero-provider-requests"];
export async function runRealUiSmoke(vsix, out) {
  const results = [];
  const missing = (reason, code) => uiIds.filter((id) => !results.some((item) => item.id === id)).forEach((id) =>
    results.push({ id, layer: "real-ui", status: "NOT_RUN", expected: "visible VS Code control completes scenario", actual: reason, errorCode: code }));
  if (process.platform !== "darwin" || !existsSync(vscodeBinary)) { missing("local macOS VS Code unavailable", "vscode-unavailable"); return results; }
  let child;
  let cdp;
  let environment;
  let providerServer;
  let providerRequests = 0;
  let nativePicker;
  const logs = [];
  const evidence = [];
  try {
    environment = prepareVscode(vsix, "real-ui");
    const project = path.join(environment.root, "synthetic-project"); mkdirSync(project);
    providerServer = createHttpServer((_request, response) => { providerRequests += 1; response.writeHead(200, { "content-type": "application/json" }); response.end('{"data":[]}'); });
    await new Promise((resolve) => providerServer.listen(0, "127.0.0.1", resolve));
    const settingsPath = path.join(environment.user, "User", "settings.json");
    const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    settings["archiAgent.localModel.baseUrl"] = `http://127.0.0.1:${providerServer.address().port}/v1`;
    writeFileSync(settingsPath, JSON.stringify(settings));
    const port = await freePort();
    child = spawn(vscodeBinary, ["--user-data-dir", environment.user, "--extensions-dir", environment.extensions,
      `--remote-debugging-port=${port}`, "--skip-welcome", "--skip-release-notes", "--new-window", project], { stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (bytes) => logs.push(bytes)); child.stderr.on("data", (bytes) => logs.push(bytes));
    child.on("error", () => {});
    const target = await waitFor(async () => {
      try { return (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((item) => item.type === "page" && /workbench/u.test(item.url)); }
      catch { return undefined; }
    }, "VS Code renderer", 20000);
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
    cdp = new Cdp(socket);
    await cdp.send("Page.bringToFront");
    await delay(2500);
    const runtime = createRequire(import.meta.url)(path.join(environment.extensionRoot, "dist", "archi-agent-runtime.js"));
    const settingFile = path.join(project, ".vscode", "settings.json");
    async function check(id, expected, fn) {
      try { const actual = await fn(); assert.equal(actual, expected);
        results.push({ id, layer: "real-ui", status: "PASS", expected, actual });
      } catch (error) {
        const screenshot = path.join(out, `ui-${id}-failure.png`); await cdp.screenshot(screenshot).catch(() => {});
        const notifications = await cdp.read('Array.from(document.querySelectorAll(".notification-list-item-message")).map(e=>e.textContent)').catch(() => []);
        results.push({ id, layer: "real-ui", status: error.notRun ? "NOT_RUN" : "FAIL", expected, actual: error.message,
          errorCode: error.code ?? notifications?.join(" ").match(/\[([a-z-]+)\]/u)?.[1] ?? "ui-assertion-failed", screenshot });
        throw error;
      }
    }
    const configure = () => cdp.palette("Archi Agent: Configure Knowledge Pack");
    await check("palette-configure", "wizard-visible", async () => {
      await configure(); await cdp.expectTitle("Archi Agent: Knowledge Pack");
      evidence.push({ step: "palette-configure", title: await cdp.title() });
      await cdp.key("Escape", "Escape"); return "wizard-visible";
    });
    for (const menu of ["Configuration", "Knowledge Management"]) {
      await check(menu === "Configuration" ? "menu-configuration" : "menu-knowledge", "wizard-visible", async () => {
        await cdp.palette("Archi Agent: Open"); await cdp.pick("Archi Agent", menu);
        await cdp.pick(`Archi Agent: ${menu}`, "Configure Knowledge Pack");
        await cdp.expectTitle("Archi Agent: Knowledge Pack"); await cdp.key("Escape", "Escape"); return "wizard-visible";
      });
    }
    let lastPack;
    for (const [index, kind] of ["system", "service", "database", "queue", "external"].entries()) {
      const id = index === 0 ? "create-new-system" : index === 1 ? "create-empty-service" : `create-${kind}`;
      await check(id, "five-valid-files-and-path-saved", async () => {
        const folder = index === 0 ? path.join(project, ".archi-agent", "knowledge") : path.join(project, `pack-${kind}`);
        if (index === 1) mkdirSync(folder);
        await configure(); await cdp.pick("Archi Agent: Knowledge Pack", "Create Knowledge Pack");
        await cdp.expectTitle("Archi Agent: new Knowledge Pack location");
        if (index === 0) assert.equal(await cdp.read('document.querySelector(".quick-input-widget input")?.value'), folder);
        await cdp.enter("Archi Agent: new Knowledge Pack location", folder);
        await cdp.enter("Archi Agent: first system identifier", `synthetic-${kind}`);
        await cdp.enter("Archi Agent: first system name", `Synthetic ${kind}`);
        await cdp.expectTitle("Archi Agent: first system kind");
        evidence.push({ step: id, kind, title: await cdp.title() });
        await cdp.screenshot(path.join(out, `ui-kind-${kind}.png`));
        await cdp.pick("Archi Agent: first system kind", kind);
        await cdp.enter("Archi Agent: first system description", "Synthetic architecture test system");
        await waitFor(() => existsSync(settingFile) && JSON.parse(readFileSync(settingFile, "utf8"))["archiAgent.knowledgePackPath"] === folder, "saved pack path");
        assert.deepEqual(readdirSync(folder).sort(), ["actors.md", "aliases.md", "relationships.md", "rules.md", "systems.md"]);
        assert.deepEqual(await runtime.validateKnowledgePackDirectory(folder), { ok: true });
        assert.match(readFileSync(path.join(folder, "systems.md"), "utf8"), new RegExp(`\\| ${kind} \\|`, "u"));
        const errors = await cdp.read('Array.from(document.querySelectorAll(".notification-list-item-message")).map(e=>e.textContent).join(" ")');
        assert.equal(errors.includes("[settings-conflict]"), false, errors);
        lastPack = folder; return "five-valid-files-and-path-saved";
      });
    }
    await check("native-folder-picker", "native-selection-path-saved", async () => {
      const folder = path.join(project, ".archi-agent", "knowledge");
      await configure(); await cdp.pick("Archi Agent: Knowledge Pack", "Choose Existing");
      const nativeScript = fileURLToPath(new URL("./ux3-native-picker.swift", import.meta.url));
      const native = spawnSync("/usr/bin/swift", [nativeScript, String(child.pid), folder], { encoding: "utf8", timeout: 45000 });
      writeFileSync(path.join(out, "native-picker.log"), native.stderr ?? "");
      nativePicker = native.stdout?.trim();
      if (native.status !== 0) {
        const error = new Error(`macOS Accessibility could not drive native folder picker: ${native.stderr?.trim() || "timeout"}`);
        error.notRun = true; error.code = "accessibility-unavailable"; throw error;
      }
      await waitFor(() => JSON.parse(readFileSync(settingFile, "utf8"))["archiAgent.knowledgePackPath"] === folder, "native selected pack");
      lastPack = folder; return "native-selection-path-saved";
    });
    await check("reopen-configure", "valid-pack-preserved-after-cancel", async () => {
      await configure(); await cdp.expectTitle("Archi Agent: Knowledge Pack");
      await cdp.key("Escape", "Escape");
      assert.equal(JSON.parse(readFileSync(settingFile, "utf8"))["archiAgent.knowledgePackPath"], lastPack);
      assert.deepEqual(await runtime.validateKnowledgePackDirectory(lastPack), { ok: true });
      return "valid-pack-preserved-after-cancel";
    });
    await check("generate-valid-pack-cancel", "flow-choice-without-onboarding-pack-preserved", async () => {
      await cdp.palette("Archi Agent: Generate Diagram"); await cdp.pick("Archi Agent: diagram type", "Sequence");
      await cdp.expectTitle("Archi Agent: flow source"); await cdp.key("Escape", "Escape");
      assert.equal(JSON.parse(readFileSync(settingFile, "utf8"))["archiAgent.knowledgePackPath"], lastPack);
      assert.deepEqual(await runtime.validateKnowledgePackDirectory(lastPack), { ok: true });
      return "flow-choice-without-onboarding-pack-preserved";
    });
    await check("onboarding-zero-provider-requests", "zero-provider-requests", async () => {
      assert.equal(providerRequests, 0);
      return "zero-provider-requests";
    });
  } catch (error) {
    missing(error.message, results.length ? "prerequisite-ui-failed" : "ui-unavailable");
  } finally {
    if (cdp) {
      cdp.socket.close();
      await Promise.race([new Promise((resolve) => cdp.socket.addEventListener("close", resolve, { once: true })), delay(1000)]);
    }
    if (child && child.exitCode === null) {
      child.kill("SIGTERM");
      await Promise.race([new Promise((resolve) => child.once("close", resolve)), delay(5000)]);
    }
    if (providerServer) await new Promise((resolve) => providerServer.close(resolve));
    writeFileSync(path.join(out, "real-ui.log"), Buffer.concat(logs));
    writeFileSync(path.join(out, "real-ui-evidence.json"), JSON.stringify({ testRoot: environment?.root, nativePicker, providerRequests, evidence, results }, null, 2));
  }
  return results;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const output = path.join(path.resolve(process.argv[3]), `diagnostic-ui-${Date.now()}`); mkdirSync(output);
  const results = await runRealUiSmoke(path.resolve(process.argv[2]), output);
  process.stdout.write(`Report: ${output}\n`);
  process.stdout.write(JSON.stringify(results, null, 2) + "\n");
  if (results.some((item) => item.status !== "PASS")) process.exitCode = 1;
}
