// Real configuration updates/events. Picker UI and listing are controlled, no HTTP.
const vscode = require("vscode"), assert = require("node:assert/strict"), fs = require("node:fs");
exports.run = async () => {
  const config = JSON.parse(fs.readFileSync(process.env.ARCHI_AUDIT_HOST_CONFIG, "utf8"));
  const results = [], api = require("./host-api.cjs"), output = vscode.window.createOutputChannel("ABA test");
  const left = vscode.workspace.workspaceFolders[0].uri, right = vscode.workspace.workspaceFolders[1].uri;
  const originalPick = vscode.window.showQuickPick, originalConfig = vscode.workspace.getConfiguration, originalSubscribe = vscode.workspace.onDidChangeConfiguration;
  let writes = 0, external = false, active = 0, events = 0, phase = "", inject;
  vscode.workspace.onDidChangeConfiguration = (...args) => {
    active++; const sub = originalSubscribe(...args); let disposed = false;
    return { dispose() { if (!disposed) { disposed = true; active--; sub.dispose(); } } };
  };
  const eventLog = originalSubscribe(event => { if (event.affectsConfiguration("archiAgent.localModel")) events++; });
  vscode.workspace.getConfiguration = (...args) => {
    const actual = originalConfig(...args);
    return { ...actual, async update(...update) {
        if (!external) writes++;
        await actual.update(...update);
        if (!external && inject) { const action = inject; inject = undefined; await action(); }
    } };
  };
  const settings = resource => vscode.workspace.getConfiguration("archiAgent", resource);
  const update = async (key, value, target = vscode.ConfigurationTarget.Global, resource) => {
    external = true;
    try { await settings(resource).update(key, value, target); } finally { external = false; }
  };
  const chosen = async (profile, model) => {
    await update("localModel.profile", profile);
    await update("localModel.selectedModel", model);
    await update("localModel.selectedModelProfile", profile);
  };
  const externalABA = async () => { await chosen("cloud-openai", "intent-B-model"); await chosen("local-lm-studio", "intent-A-model"); };
  const assertA = () => {
    assert.equal(settings().get("localModel.profile"), "local-lm-studio");
    assert.equal(settings().get("localModel.selectedModel"), "intent-A-model");
    assert.equal(settings().get("localModel.selectedModelProfile"), "local-lm-studio");
  };
  const runtime = api.createArchiAgentRuntime();
  runtime.listProviderModels = async () => {
    if (phase === "listing") await externalABA();
    return { ok: true, models: ["stale-picker-model"] };
  };
  vscode.window.showQuickPick = async items => {
    if (phase === "picker") await externalABA();
    if (phase === "unrelated") await originalConfig("editor").update("fontSize", 17, vscode.ConfigurationTarget.Global);
    if (phase === "other-resource" || phase === "other-resource-unscoped") await update("knowledgePackPath", "/synthetic/right-pack", vscode.ConfigurationTarget.WorkspaceFolder, right);
    if (phase === "workspace-ABA") {
      await update("localModel.baseUrl", "http://127.0.0.1:7890/v1", vscode.ConfigurationTarget.Workspace);
      await update("localModel.baseUrl", "http://127.0.0.1:1234/v1", vscode.ConfigurationTarget.Workspace);
    }
    return items[0];
  };
  async function check(id, task) {
    try { const evidence = await task(); assert.equal(active, 0, "observation leaked"); results.push({ id, status: "PASS", activeSubscriptions: active, ...evidence }); }
    catch (error) { results.push({ id, status: "FAIL", error: error.stack }); }
  }
  try {
    // Register the actual installed VSIX settings schema before controlled updates.
    const extension = vscode.extensions.getExtension("setech-pl.archi-agent"); assert.ok(extension);
    for (const scenario of ["listing", "picker", "unchanged", "unrelated", "other-resource", "other-resource-unscoped", "publication-ABA", "workspace-ABA", "legacy"]) {
      await check(`AUD-002-${scenario}`, async () => {
        phase = ""; await update("knowledgePackPath", undefined, vscode.ConfigurationTarget.WorkspaceFolder, right);
        await update("localModel.baseUrl", "http://127.0.0.1:1234/v1", vscode.ConfigurationTarget.Workspace);
        await chosen("local-lm-studio", "intent-A-model"); writes = 0; const eventStart = events; phase = scenario;
        if (scenario === "legacy") {
          await update("localModel.profile", undefined); await update("localModel.selectedModel", undefined);
          await update("localModel.selectedModelProfile", undefined); await update("localModel.model", "legacy-model");
        }
        if (scenario === "publication-ABA") inject = externalABA;
        const result = await api.selectModel(runtime, output, undefined, undefined, scenario === "other-resource-unscoped" ? undefined : left);
        if (["listing", "picker", "publication-ABA", "workspace-ABA"].includes(scenario)) {
          assert.equal(result.status, "cancelled"); assert.equal(writes, scenario === "publication-ABA" ? 1 : 0); assertA();
          assert.ok(events - eventStart >= (scenario === "workspace-ABA" ? 2 : 6), "real VS Code configuration events missing");
        } else {
          assert.equal(result.status, "selected"); assert.equal(writes, 3);
          assert.equal(settings().get("localModel.selectedModel"), "stale-picker-model");
          assert.equal(settings().get("localModel.selectedModelProfile"), "local-lm-studio");
        }
        return { selectionStatus: result.status, operationWrites: writes, deliveredProviderEvents: events - eventStart,
          profile: settings().get("localModel.profile"), model: settings().get("localModel.selectedModel"), binding: settings().get("localModel.selectedModelProfile") };
      });
    }
  } finally {
    eventLog.dispose(); output.dispose(); vscode.window.showQuickPick = originalPick;
    vscode.workspace.getConfiguration = originalConfig; vscode.workspace.onDidChangeConfiguration = originalSubscribe;
    fs.writeFileSync(config.report, JSON.stringify({ version: vscode.version, node: process.version,
      layer: "real Extension Host settings/events; production source picker/guard; controlled listing/QuickPick", results }, null, 2) + "\n");
  }
  if (results.some(r => r.status !== "PASS")) throw new Error("ABA Host regression failed");
};
