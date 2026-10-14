#!/usr/bin/env node
// Execute unchanged extracted VSIX bundles with a controlled VS Code adapter and final transport.
// Args: extracted extension directory, compiled vscode-module-double.cjs, synthetic pack, report.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
const [extension, adapter, pack, report] = process.argv.slice(2);
if (!report) throw new Error("Expected extension, adapter, pack and report paths");
const require = createRequire(import.meta.url), Module = require("node:module");
const host = require(path.resolve(adapter));
const runtimePath = path.resolve(extension, "dist/archi-agent-runtime.js"), entry = path.resolve(extension, "dist/extension.js");
const actual = require(runtimePath), load = Module._load;
const profiles = ["local-lm-studio", "local-ollama", "cloud-anthropic", "cloud-openai", "cloud-openrouter"];
const clouds = profiles.slice(2), results = [];
let remoteTransport;
Module._load = function(name, ...args) {
  if (name === "vscode") return host;
  if (name === "./archi-agent-runtime.js") return { ...actual, createArchiAgentRuntime: options => actual.createArchiAgentRuntime({ ...options, remoteTransport }) };
  return load.call(this, name, ...args);
};
const marker = profile => `synthetic-${profile}-audit-key`;
const put = (key, value) => {
  const full = `archiAgent.localModel.${key}`;
  host.state.configuration.set(full, value);
  host.state.configurationInspect.set(full, { globalValue: value });
};
const chosen = (profile, model) => { put("profile", profile); put("selectedModel", model); put("selectedModelProfile", profile); };
function start() {
  host.resetDouble(); delete require.cache[entry];
  host.state.configuration.set("archiAgent.knowledgePackPath", path.resolve(pack));
  for (const profile of clouds) host.state.secrets.set(`archiAgent.cloudProvider.${profile.replace("cloud-", "")}.apiKey`, marker(profile));
  const context = host.createExtensionContext(); require(entry).activate(context);
  const original = host.workspace.getConfiguration;
  host.workspace.getConfiguration = (...args) => {
    const config = original(...args);
    return { ...config, async update(key, value, target) {
      const previous = config.inspect(key)?.globalValue;
      await config.update(key, value, target);
      const full = `${args[0]}.${key}`;
      if (!Object.is(previous, value)) host.configurationChanged({ affectsConfiguration: section => full === section || full.startsWith(section + ".") });
    } };
  };
  return () => { context.subscriptions.forEach(d => d.dispose()); host.workspace.getConfiguration = original; };
}
async function run(id, test) {
  try { await test(); results.push({ id, status: "PASS" }); }
  catch { results.push({ id, status: "FAIL", reason: "assertion-or-adapter-failed" }); }
}
try {
  for (const from of profiles) for (const to of clouds) for (const type of ["sequence", "component"]) {
    await run(`AUD-001-${type}-${from}-to-${to}`, async () => {
      const requests = [];
      remoteTransport = { async exchange(request) {
        requests.push(request);
        if (request.endpoint.endsWith("models")) return JSON.stringify({ data: [{ id: "final-model", supported_parameters: ["response_format"], capabilities: { structured_outputs: { supported: true } } }], has_more: false });
        const body = JSON.parse(request.body), input = JSON.parse(body.messages[to === "cloud-anthropic" ? 0 : 1].content);
        const review = requests.filter(r => !r.endpoint.endsWith("models")).length === 2;
        if (!review) chosen(from, "concurrent-newer-model");
        const plan = review ? undefined : type === "sequence" ? { version: 3, groundedSteps: [{ order: 1, operationId: "op-0001", label: "Registers frames" }], userStatedSteps: [] } :
          { version: 1, elementIds: input.snapshot.elements.map(e => e.id), groundedDependencies: input.relationshipCatalog.map(d => d.dependencyId), userStatedDependencies: [] };
        const content = JSON.stringify(review ? { accepted: true, confirmedUserStatedFactIds: [], violations: [] } : plan);
        return to === "cloud-anthropic" ? JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: content }] }) : JSON.stringify({ choices: [{ finish_reason: "stop", message: { content, refusal: null } }] });
      } };
      const stop = start();
      try {
        chosen(from, ""); host.state.quickPickAnswers.push(items => items.find(i => i.id === type), items => { chosen(to, ""); return items.find(i => i.source === "description"); }, items => items[0]);
        host.state.inputBoxAnswers.push("Audit", "Telescope Scheduler registers frames in Image Archive.");
        await host.state.registeredCommands.get("archiAgent.generateDiagram")();
        const prefix = to.replace("cloud-", ""), endpoint = to === "cloud-anthropic" ? "anthropic-messages" : `${prefix}-chat-completions`;
        assert.deepEqual(requests.map(r => r.endpoint), [`${prefix}-models`, endpoint, endpoint]);
        for (const r of requests) {
          assert.equal(to === "cloud-anthropic" ? r.headers["x-api-key"] : r.headers.Authorization, to === "cloud-anthropic" ? marker(to) : `Bearer ${marker(to)}`);
          assert.equal((r.body ?? "").includes(marker(to)), false);
        }
        assert.deepEqual(requests.slice(1).map(r => JSON.parse(r.body).model), ["final-model", "final-model"]);
        assert.equal(host.state.openedDocuments.length, 2);
      } finally { stop(); }
    });
  }
  for (const phase of ["listing", "picker", "apply", "cancel", "aba-listing", "aba-picker"]) {
    await run(`AUD-002-packaged-${phase}`, async () => {
      let calls = 0;
      const externalABA = async () => {
        for (const [profile, model] of [["cloud-openai", "newer-model"], ["cloud-anthropic", ""]]) {
          for (const [key, value] of [["profile", profile], ["selectedModel", model], ["selectedModelProfile", profile]]) {
            await host.workspace.getConfiguration("archiAgent").update(`localModel.${key}`, value, 1);
          }
        }
      };
      remoteTransport = { async exchange() { calls++; if (phase === "listing") chosen("cloud-openai", "newer-model"); if (phase === "aba-listing") await externalABA(); return JSON.stringify({ data: [{ id: "late-model", capabilities: { structured_outputs: { supported: true } } }], has_more: false }); } };
      const stop = start();
      try {
        chosen("cloud-anthropic", "");
        host.state.quickPickAnswers.push(items => items[0], items => items.find(i => i.source === "description"), async items => {
          if (phase === "apply") {
            await host.state.registeredCommands.get("archiAgent.configuration")();
            const panel = host.panels[0];
            for (let wait = 0; wait < 100 && !panel.webview.messages.some(m => m.type === "state"); wait++) await new Promise(r => setTimeout(r, 10));
            const state = panel.webview.messages.filter(m => m.type === "state").at(-1);
            await panel.receive({ op: "apply", revision: state.revision, baseRevision: state.revision, form: { profile: "cloud-openai", model: "newer-model", endpoint: "http://127.0.0.1:1234/v1", timeout: 120 } });
            assert.equal(panel.webview.messages.filter(m => m.type === "state").at(-1).applied, true);
          } else if (phase === "picker") chosen("cloud-openai", "newer-model");
          if (phase === "aba-picker") await externalABA();
          return phase === "cancel" ? undefined : items[0];
        });
        host.state.inputBoxAnswers.push("Audit", "Telescope Scheduler registers frames in Image Archive.");
        await host.state.registeredCommands.get("archiAgent.generateDiagram")();
        assert.equal(calls, 1); assert.equal(host.state.openedDocuments.length, 0);
        if (phase.startsWith("aba-")) {
          assert.equal(host.state.configurationInspect.get("archiAgent.localModel.profile").globalValue, "cloud-anthropic");
          assert.equal(host.state.configurationInspect.get("archiAgent.localModel.selectedModel").globalValue, "");
          assert.equal(host.state.configurationInspect.get("archiAgent.localModel.selectedModelProfile").globalValue, "cloud-anthropic");
          assert.equal(host.state.configurationUpdates.length, 6);
        } else if (phase !== "cancel") {
          assert.equal(host.state.configurationInspect.get("archiAgent.localModel.profile").globalValue, "cloud-openai");
          assert.equal(host.state.configurationInspect.get("archiAgent.localModel.selectedModel").globalValue, "newer-model");
          assert.equal(host.state.configurationInspect.get("archiAgent.localModel.selectedModelProfile").globalValue, "cloud-openai");
        }
        if (phase !== "apply" && !phase.startsWith("aba-")) assert.equal(host.state.configurationUpdates.length, 0);
      } finally { stop(); }
    });
  }
} finally { Module._load = load; }
writeFileSync(report, JSON.stringify({ layer: "unchanged-packaged-host-runtime-with-controlled-adapters", results }, null, 2) + "\n");
process.stdout.write(`Packaged audit regressions: ${results.filter(r => r.status === "PASS").length}/${results.length} PASS\n`);
if (results.some(r => r.status !== "PASS")) process.exitCode = 1;
