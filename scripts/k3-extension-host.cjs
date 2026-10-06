// Real Extension Host/settings; controlled picker answers are adapter evidence, not native UI.
const vscode = require("vscode"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), Module = require("node:module"), http = require("node:http");
exports.run = async () => {
  const settings = JSON.parse(fs.readFileSync(process.env.UX3_HOST_CONFIG, "utf8")), results = [], messages = [];
  const original = {}, load = Module._load;
  const folder = vscode.workspace.workspaceFolders?.at(-1), resource = folder?.uri;
  const target = folder ? vscode.ConfigurationTarget.WorkspaceFolder : vscode.ConfigurationTarget.Global;
  const config = () => vscode.workspace.getConfiguration("archiAgent", resource);
  const source = path.join(settings.root, "synthetic.md"); fs.writeFileSync(source, "Alpha service.");
  let calls = 0, phase = "save", sequence = 0, folderName = "host-save", failActivation = false;
  const server = http.createServer((req, res) => { let body = ""; req.on("data", (b) => body += b); req.on("end", () => {
    calls++; const s = JSON.parse(JSON.parse(body).messages[1].content).sources[0];
    const value = { version: 1, candidates: [{ table: "systems", row: { id: "a", canonical_name: "Alpha", kind: "service", description: "Service" }, basis: "explicit", reasoning: null,
      evidence: [{ sourceId: s.sourceId, originalDigest: s.originalDigest, textDigest: s.textDigest, excerpt: s.text, startOffset: 0, endOffset: s.text.length }] }] };
    res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }] }));
  }); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  for (const k of ["showOpenDialog", "showQuickPick", "showInputBox", "showErrorMessage", "showInformationMessage"]) original[k] = vscode.window[k];
  original.getConfiguration = vscode.workspace.getConfiguration;
  vscode.window.showOpenDialog = async (o) => [vscode.Uri.file(o.canSelectFiles ? source : settings.root)];
  vscode.window.showInputBox = async () => folderName;
  vscode.window.showQuickPick = async (items, o) => {
    if (o.title === "Archi Agent: select project folder") return items.at(-1);
    if (o.title === "Archi Agent: review Knowledge Pack candidates") return phase === "cancel" ? "Cancel" : sequence++ === 0 ? "Accept all pending" : "Validate and preview";
    if (o.title === "Archi Agent: preview new Knowledge Pack") return phase === "save" ? "Save" : "Save and use";
    return undefined;
  };
  vscode.window.showErrorMessage = async (m) => { messages.push(m); };
  vscode.window.showInformationMessage = async (m) => { messages.push(m); };
  vscode.workspace.getConfiguration = (...args) => {
    const c = original.getConfiguration(...args);
    if (!failActivation) return c;
    return { ...c, get: c.get.bind(c), inspect: c.inspect.bind(c), update: async (key, value, scope) => {
      if (key === "knowledgePackPath") { await c.update(key, "parallel-change", scope); throw new Error("injected settings fault"); }
      return c.update(key, value, scope);
    } };
  };
  async function check(id, task) { try { await task(); results.push({ id: `${id}-${settings.mode}`, status: "PASS", layer: "Extension Host controlled UI + real settings" }); } catch (e) { results.push({ id: `${id}-${settings.mode}`, status: "FAIL", error: e.stack }); } }
  const run = async (operation, name) => { phase = operation; sequence = 0; folderName = name; await vscode.commands.executeCommand("archiAgent.buildKnowledgePack"); };
  try {
    const extension = vscode.extensions.getExtension("setech-pl.archi-agent"); assert.ok(extension);
    Module._load = function(request, parent, ...rest) { if (request === "vscode" && parent?.filename === path.join(extension.extensionPath, "dist/extension.js")) return vscode; return load.call(this, request, parent, ...rest); };
    await extension.activate(); Module._load = load;
    await config().update("knowledgePackPath", undefined, target);
    const global = original.getConfiguration("archiAgent");
    await global.update("localModel.baseUrl", `http://127.0.0.1:${server.address().port}/v1`, vscode.ConfigurationTarget.Global);
    await global.update("localModel.model", "synthetic-k3", vscode.ConfigurationTarget.Global);
    await check("k3-contributed-command", async () => { assert.ok((await vscode.commands.getCommands(true)).includes("archiAgent.buildKnowledgePack")); });
    await check("k3-save-no-setting", async () => {
      await run("save", "host-save"); assert.equal(calls, 1); assert.equal(config().get("knowledgePackPath"), ""); assert.equal(fs.readdirSync(path.join(settings.root, "host-save")).length, 5);
    });
    await check("k3-save-use-correct-scope", async () => {
      await run("use", "host-use"); assert.equal(calls, 2); assert.equal(config().get("knowledgePackPath"), path.join(settings.root, "host-use"));
      assert.equal(folder ? config().inspect("knowledgePackPath").workspaceFolderValue : config().inspect("knowledgePackPath").globalValue, path.join(settings.root, "host-use"));
      if (vscode.workspace.workspaceFolders?.length > 1) assert.equal(original.getConfiguration("archiAgent", vscode.workspace.workspaceFolders[0].uri).get("knowledgePackPath"), "");
    });
    await check("k3-review-cancel-keeps-setting", async () => {
      await run("cancel", "host-cancel"); assert.equal(calls, 3); assert.equal(config().get("knowledgePackPath"), path.join(settings.root, "host-use")); assert.ok(!fs.existsSync(path.join(settings.root, "host-cancel")));
    });
    await check("k3-activation-fault-keeps-pack-parallel-setting", async () => {
      failActivation = true; await run("use", "host-failure"); failActivation = false;
      assert.equal(calls, 4); assert.equal(config().get("knowledgePackPath"), "parallel-change"); assert.equal(fs.readdirSync(path.join(settings.root, "host-failure")).length, 5);
      assert.ok(messages.at(-1).includes("saved, not activated"));
    });
  } finally {
    Module._load = load; for (const [k, v] of Object.entries(original)) if (k !== "getConfiguration") vscode.window[k] = v;
    vscode.workspace.getConfiguration = original.getConfiguration; server.closeAllConnections(); await new Promise((r) => server.close(r));
    fs.writeFileSync(settings.report, JSON.stringify({ version: vscode.version, node: process.version, requests: calls, messages, results }, null, 2) + "\n");
  }
  if (results.some((r) => r.status !== "PASS")) throw new Error("K3 Host failed");
};
