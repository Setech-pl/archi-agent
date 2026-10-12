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
  async send(method, params = {}, sessionId) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 10000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
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
    const point = await this.read('(()=>{const r=document.querySelector(".quick-input-widget input").getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()');
    await this.send("Input.dispatchMouseEvent",{type:"mousePressed",button:"left",clickCount:1,...point});
    await this.send("Input.dispatchMouseEvent",{type:"mouseReleased",button:"left",clickCount:1,...point});
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
    const point = await waitFor(() => this.read(`(() => {
      const label = Array.from(document.querySelectorAll(".quick-input-list .label-name")).find(e => e.textContent === ${JSON.stringify(command)});
      const r = label?.getBoundingClientRect(); return r?.height > 0 ? {x:r.x+r.width/2,y:r.y+r.height/2} : undefined;
    })()`), `palette command ${command}`);
    await this.send("Input.dispatchMouseEvent", {type:"mousePressed",button:"left",clickCount:1,...point});
    await this.send("Input.dispatchMouseEvent", {type:"mouseReleased",button:"left",clickCount:1,...point});
    await delay(200);
  }
  async screenshot(destination) {
    const screenshot = await this.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(destination, Buffer.from(screenshot.data, "base64"));
  }
}
export async function runRealUiSmoke(vsix, out) {
  return (await import("./ux4-real-ui-smoke.mjs")).runUx4UiSmoke(vsix, out);
}
