// Actual installed production commands; controlled editor answers and transport are separate from native UI.
const vscode = require("vscode"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), Module = require("node:module"), http = require("node:http"), crypto = require("node:crypto");
exports.run = async () => {
  const settings = JSON.parse(fs.readFileSync(process.env.UX3_HOST_CONFIG, "utf8")), results = [], messages = [], original = {}, load = Module._load;
  // This small fixture lives beside the harness, never inside the product VSIX.
  const { prepare, answer } = require("./art1-smoke-fixture.cjs");
  const { pack, flow } = prepare(settings.root);
  let calls = 0, mode = "sequence", saving = false, cancel = false, cancelProject = false, selectedIndex = 0, projectChoices = 0;
  const folder = vscode.workspace.workspaceFolders?.at(-1);
  const server = http.createServer((req, res) => { let body = ""; req.on("data", (b) => body += b); req.on("end", () => {
    calls++; const value = answer(JSON.parse(JSON.parse(body).messages[1].content), mode === "component");
    res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }] }));
  }); }); await new Promise((r) => server.listen(0, "127.0.0.1", r));
  for (const key of ["showQuickPick", "showOpenDialog", "showWarningMessage", "showInformationMessage", "showErrorMessage"]) original[key] = vscode.window[key];
  original.getConfiguration = vscode.workspace.getConfiguration;
  vscode.workspace.getConfiguration = (...args) => { assert.ok(!saving, "save must not read settings"); return original.getConfiguration(...args); };
  vscode.window.showQuickPick = async (items, o) => {
    if (o.title === "Archi Agent: diagram type") return items.find((i) => i.id === mode);
    if (o.title === "Archi Agent: flow source") return items.find((i) => i.source === "file");
    if (o.title === "Archi Agent: select project folder") return items.at(-1);
    if (o.title === "Archi Agent: choose original diagram result") return items[selectedIndex];
    if (o.title === "Archi Agent: select save project") { projectChoices++; return cancelProject ? undefined : items.at(-1); }
    return undefined;
  };
  vscode.window.showOpenDialog = async () => [vscode.Uri.file(flow)];
  vscode.window.showWarningMessage = async (message, options, ...actions) => { messages.push({ message, options, actions }); return cancel ? undefined : actions.includes("Save Diagram and Report") ? "Save Diagram and Report" : undefined; };
  vscode.window.showInformationMessage = async (message, ...actions) => { messages.push({ message, actions }); };
  vscode.window.showErrorMessage = async (message) => { messages.push({ message }); };
  const resultRoot = folder ? path.join(folder.uri.fsPath, "archi-agent-results") : null;
  const dirs = () => resultRoot && fs.existsSync(resultRoot) ? fs.readdirSync(resultRoot) : [];
  const save = async () => { saving = true; try { await vscode.commands.executeCommand("archiAgent.saveDiagramAndReport"); } finally { saving = false; } };
  async function check(id, fn) { try { await fn(); results.push({ id: `art1-${id}-${settings.mode}`, status: "PASS", layer: "actual Extension Host, controlled editor answers" }); } catch (e) { results.push({ id: `art1-${id}-${settings.mode}`, status: "FAIL", error: e.stack }); } }
  try {
    const extension = vscode.extensions.getExtension("setech-pl.archi-agent"); assert.ok(extension);
    Module._load = function(request, parent, ...rest) { if (request === "vscode" && parent?.filename === path.join(extension.extensionPath, "dist/extension.js")) return vscode; return load.call(this, request, parent, ...rest); };
    await extension.activate(); Module._load = load;
    await check("no-result", async () => { await save(); assert.ok(messages.at(-1).message.includes("Generate a Sequence or Component")); assert.equal(calls, 0); });
    const config = original.getConfiguration("archiAgent", folder?.uri);
    await config.update("knowledgePackPath", pack, folder ? vscode.ConfigurationTarget.WorkspaceFolder : vscode.ConfigurationTarget.Global);
    const global = original.getConfiguration("archiAgent");
    await global.update("localModel.baseUrl", `http://127.0.0.1:${server.address().port}/v1`, vscode.ConfigurationTarget.Global);
    await global.update("localModel.model", "synthetic-art1", vscode.ConfigurationTarget.Global);
    const originals = [];
    for (const diagramType of ["sequence", "component"]) {
      await check(`${diagramType}-production-generation`, async () => { mode = diagramType; await vscode.commands.executeCommand("archiAgent.generateDiagram");
        const documents = vscode.workspace.textDocuments.filter((d) => d.isUntitled && d.getText().startsWith("@startuml"));
        originals.push(documents.at(-1).getText()); assert.equal(calls, diagramType === "sequence" ? 2 : 4); });
    }
    const documents = vscode.workspace.textDocuments.filter((d) => d.isUntitled && d.getText().startsWith("@startuml"));
    const edit = new vscode.WorkspaceEdit(); edit.insert(documents[0].uri, new vscode.Position(1, 0), "' MANUAL_EDIT_MARKER\n"); await vscode.workspace.applyEdit(edit);
    await config.update("knowledgePackPath", "MISSING_PACK_AFTER_GENERATION", folder ? vscode.ConfigurationTarget.WorkspaceFolder : vscode.ConfigurationTarget.Global);
    await global.update("localModel.model", "CHANGED_MODEL_MARKER", vscode.ConfigurationTarget.Global);
    fs.rmSync(pack, { recursive: true });
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument({ content: "UNRELATED_EDITOR_MARKER" }));
    if (!folder) {
      await check("no-project-instruction", async () => { await save(); assert.ok(messages.at(-1).message.includes("open a project folder")); assert.equal(calls, 4); });
    } else {
      await check("cancel-confirmation", async () => { cancel = true; await save(); cancel = false; assert.deepEqual(dirs(), []); assert.equal(calls, 4); });
      if (settings.mode === "multi-root") await check("cancel-project", async () => { cancelProject = true; await save(); cancelProject = false; assert.deepEqual(dirs(), []); });
      const ids = [];
      for (const [i, type] of [[0, "sequence"], [1, "component"], [0, "repeat-sequence"]]) {
        await check(`${type}-save-original`, async () => {
          const before = dirs(); selectedIndex = i; await save(); const created = dirs().filter((d) => !before.includes(d)); assert.equal(created.length, 1);
          const dir = path.join(resultRoot, created[0]), bytes = fs.readFileSync(path.join(dir, "diagram.puml")), report = JSON.parse(fs.readFileSync(path.join(dir, "report.json")));
          assert.equal(bytes.toString(), originals[i]); assert.equal(report.diagram.sha256, crypto.createHash("sha256").update(bytes).digest("hex")); assert.equal(report.diagram.byteLength, bytes.length);
          assert.equal(report.versions.extension, extension.packageJSON.version); assert.equal(report.diagramType, i === 0 ? "sequence" : "component"); assert.equal(calls, 4);
          assert.ok(!JSON.stringify(report).includes("CHANGED_MODEL_MARKER")); assert.ok(!bytes.toString().includes("MANUAL_EDIT_MARKER"));
          ids.push(report.resultId); const confirmation = messages.findLast((m) => m.options?.modal);
          assert.ok(confirmation.options.detail.includes(dir)); assert.ok(confirmation.options.detail.includes("diagram.puml\nreport.json"));
          assert.equal(fs.readdirSync(dir).length, 2);
        });
      }
      await check("result-identity-and-project-scope", async () => { assert.equal(ids[0], ids[2]); assert.notEqual(ids[0], ids[1]); assert.equal(calls, 4);
        if (settings.mode === "multi-root") { assert.ok(projectChoices >= 5); assert.ok(!fs.existsSync(path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, "archi-agent-results"))); }
      });
    }
  } finally {
    Module._load = load; for (const [key, value] of Object.entries(original)) if (key !== "getConfiguration") vscode.window[key] = value;
    vscode.workspace.getConfiguration = original.getConfiguration; server.closeAllConnections(); await new Promise((r) => server.close(r));
    fs.writeFileSync(settings.report, JSON.stringify({ version: vscode.version, node: process.version, platform: process.platform, arch: process.arch, requests: calls, messages, results }, null, 2) + "\n");
  }
  if (results.some((r) => r.status !== "PASS")) throw Error("ART1 host failed");
};
