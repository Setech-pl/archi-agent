// Q-02: actual installed Extension Host; editor answers and model transport are controlled.
const vscode = require("vscode"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), Module = require("node:module"), http = require("node:http");
exports.run = async () => {
  const settings = JSON.parse(fs.readFileSync(process.env.UX3_HOST_CONFIG, "utf8"));
  const results = [], events = [], messages = [], original = {}, load = Module._load;
  const { prepare, answer } = require("./art1-smoke-fixture.cjs"), { pack, flow } = prepare(settings.root);
  const folder = vscode.workspace.workspaceFolders?.at(-1), resultRoot = folder && path.join(folder.uri.fsPath, "archi-agent-results");
  let calls = 0, choices = 0;
  const server = http.createServer((req, res) => { let body = ""; req.on("data", b => body += b); req.on("end", () => {
    calls++; res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(answer(JSON.parse(JSON.parse(body).messages[1].content))) } }] }));
  }); });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  for (const key of ["showQuickPick", "showOpenDialog", "showWarningMessage", "showInformationMessage", "showErrorMessage"]) original[key] = vscode.window[key];
  vscode.window.showQuickPick = async (items, options) => {
    if (options.title === "Archi Agent: diagram type") return items.find(i => i.id === "sequence");
    if (options.title === "Archi Agent: flow source") return items.find(i => i.source === "file");
    if (options.title === "Archi Agent: choose original diagram result") { choices = items.length; return items[0]; }
    return items.at(-1);
  };
  vscode.window.showOpenDialog = async () => [vscode.Uri.file(flow)];
  vscode.window.showWarningMessage = async (text, options, ...actions) => { messages.push(text); return actions.includes("Save Diagram and Report") ? "Save Diagram and Report" : undefined; };
  vscode.window.showInformationMessage = vscode.window.showErrorMessage = async text => { messages.push(text); };
  const close = vscode.workspace.onDidCloseTextDocument(doc => events.push({ uri: doc.uri.toString(), languageId: doc.languageId, isClosed: doc.isClosed,
    sameUriOpenAtEvent: vscode.workspace.textDocuments.some(d => d.uri.toString() === doc.uri.toString()) }));
  const delay = ms => new Promise(r => setTimeout(r, ms));
  async function check(id, fn) { try { await fn(); results.push({ id: `art1-q02-${id}-${settings.mode}`, status: "PASS", layer: "actual Extension Host, controlled editor answers" }); }
    catch (e) { results.push({ id: `art1-q02-${id}-${settings.mode}`, status: "FAIL", error: e.stack }); } }
  const count = () => resultRoot && fs.existsSync(resultRoot) ? fs.readdirSync(resultRoot).length : 0;
  try {
    const extension = vscode.extensions.getExtension("setech-pl.archi-agent"); assert.ok(extension);
    Module._load = function(request, parent, ...rest) { if (request === "vscode" && parent?.filename === path.join(extension.extensionPath, "dist/extension.js")) return vscode; return load.call(this, request, parent, ...rest); };
    await extension.activate(); Module._load = load;
    await vscode.workspace.getConfiguration("archiAgent", folder?.uri).update("knowledgePackPath", pack, folder ? vscode.ConfigurationTarget.WorkspaceFolder : vscode.ConfigurationTarget.Global);
    const global = vscode.workspace.getConfiguration("archiAgent");
    await global.update("localModel.baseUrl", `http://127.0.0.1:${server.address().port}/v1`, vscode.ConfigurationTarget.Global);
    await global.update("localModel.model", "synthetic-q02", vscode.ConfigurationTarget.Global);
    let diagram, report;
    await check("generation-both-previews", async () => {
      await vscode.commands.executeCommand("archiAgent.generateDiagram"); assert.equal(calls, 2);
      diagram = vscode.workspace.textDocuments.find(d => d.isUntitled && d.getText().startsWith("@startuml"));
      report = vscode.workspace.textDocuments.find(d => d.isUntitled && d.languageId === "json");
      assert.ok(diagram && report); assert.ok(!diagram.isClosed && !report.isClosed);
      assert.ok(vscode.window.tabGroups.all.flatMap(g => g.tabs).some(t => t.input.uri?.toString() === diagram.uri.toString()));
      assert.ok(vscode.window.tabGroups.all.flatMap(g => g.tabs).some(t => t.input.uri?.toString() === report.uri.toString()));
    });
    for (const [id, change] of [["one-language-change", async () => { diagram = await vscode.languages.setTextDocumentLanguage(diagram, "markdown"); }],
      ["both-language-change", async () => { report = await vscode.languages.setTextDocumentLanguage(report, "plaintext"); }]]) {
      await check(id, async () => {
        await change(); await delay(100); assert.ok(!diagram.isClosed && !report.isClosed);
        const before = count(); choices = 0; await vscode.commands.executeCommand("archiAgent.saveDiagramAndReport");
        assert.equal(choices, 1, "still-open original must remain in palette Save choices"); assert.equal(calls, 2);
        if (folder) assert.equal(count(), before + 1); else assert.ok(messages.at(-1).includes("open a project folder"));
      });
    }
    await check("real-close-one-keeps-result", async () => {
      const tab = vscode.window.tabGroups.all.flatMap(g => g.tabs).find(t => t.input.uri?.toString() === diagram.uri.toString());
      assert.ok(tab); assert.equal(await vscode.window.tabGroups.close(tab), true);
      await delay(1200); assert.ok(diagram.isClosed); choices = 0;
      await vscode.commands.executeCommand("archiAgent.saveDiagramAndReport"); assert.equal(choices, 1); assert.equal(calls, 2);
    });
    await check("real-close-both-removes-result", async () => {
      const tab = vscode.window.tabGroups.all.flatMap(g => g.tabs).find(t => t.input.uri?.toString() === report.uri.toString());
      assert.ok(tab); assert.equal(await vscode.window.tabGroups.close(tab), true);
      await delay(1200); assert.ok(report.isClosed); choices = 0;
      await vscode.commands.executeCommand("archiAgent.saveDiagramAndReport"); assert.equal(choices, 0);
      assert.ok(messages.at(-1).includes("no completed diagram")); assert.equal(calls, 2);
    });
  } finally {
    close.dispose(); Module._load = load; Object.assign(vscode.window, original);
    server.closeAllConnections(); await new Promise(r => server.close(r));
    fs.writeFileSync(settings.report, JSON.stringify({ version: vscode.version, node: process.version, platform: process.platform, arch: process.arch, requests: calls, events, messages, results }, null, 2) + "\n");
  }
  if (results.some(r => r.status !== "PASS")) throw Error("ART1 Q02 host failed");
};
