// Test entry point for VS Code's real Extension Host. Never included in the VSIX.
const vscode = require("vscode");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const {controlWebviews,wait} = require("./ux4-host-webview.cjs");

exports.run = async function run() {
  const settings = JSON.parse(fs.readFileSync(process.env.UX3_HOST_CONFIG, "utf8"));
  const results = [];
  const original = {};
  const views = controlWebviews(vscode);
  const messages = [];
  const prompts = [];
  let conflict = false;
  const folder = vscode.workspace.workspaceFolders?.at(-1);
  const resource = folder?.uri;
  const target = folder ? vscode.ConfigurationTarget.WorkspaceFolder : vscode.ConfigurationTarget.Global;
  const config = () => vscode.workspace.getConfiguration("archiAgent", resource);
  const destination = path.join(settings.root, "host-pack");
  const loadModule = Module._load;
  let providerRequests = 0;
  let operation = "create";
  for (const key of ["showInputBox", "showQuickPick", "showErrorMessage", "showOpenDialog"]) original[key] = vscode.window[key];
  vscode.window.showErrorMessage = async (text) => { messages.push(text); return undefined; };
  vscode.window.showQuickPick = async (items, options) => {
    prompts.push(options?.title);
    if (options?.title === "Archi Agent: select project folder") return items.at(-1);
    if (options?.title === "Archi Agent: first system kind") return items.find((item) => item.label === "service");
    return items.find((item) => item.id === operation);
  };
  vscode.window.showInputBox = async (options) => {
    prompts.push(options.title);
    if (conflict && options.title === "Archi Agent: first system name") {
      await config().update("knowledgePackPath", path.join(settings.root, "external-pack"), target);
    }
    return ({
      "Archi Agent: new Knowledge Pack location": destination,
      "Archi Agent: new pack folder name": "host-pack",
      "Archi Agent: first system identifier": "synthetic-service",
      "Archi Agent: first system name": "Synthetic Service",
      "Archi Agent: first system description": "Synthetic test system"
    })[options.title];
  };
  vscode.window.showOpenDialog = async () => [vscode.Uri.file(settings.root)];
  async function open() {
    await vscode.commands.executeCommand("archiAgent.configureKnowledgePack");
    const panel=await wait(()=>views.panels[0]?.latest&&views.panels[0]);
    if(vscode.workspace.workspaceFolders?.length>1 && !panel.latest.projectSelected) await panel.send("project",{project:String(vscode.workspace.workspaceFolders.length-1)});
    return panel;
  }
  async function create() { const panel=await open(); await wait(()=>!panel.latest.busy && panel.latest.packPath===(config().get("knowledgePackPath")??""), "settled effective pack before create"); await panel.send("create"); }
  async function check(id, expected, fn) {
    try {
      const actual = await fn();
      assert.equal(actual, expected);
      results.push({ id, layer: "Extension Host", status: "PASS", expected, actual });
    } catch (error) {
      results.push({ id, layer: "Extension Host", status: "FAIL", expected,
        actual: error.message, errorCode: messages.at(-1)?.match(/\[([a-z-]+)\]/u)?.[1] ?? "assertion-failed" });
    }
  }
  try {
    const extension = vscode.extensions.getExtension("setech-pl.archi-agent");
    assert.ok(extension, "candidate installed");
    // VS Code creates a distinct API object per extension. Bind only the candidate's editor
    // import to this harness API: UI answers are controlled, configuration stays real.
    Module._load = function(request, parent, ...rest) {
      if (request === "vscode" && parent?.filename === path.join(extension.extensionPath, "dist", "extension.js")) return vscode;
      if (["node:http", "node:https"].includes(request) && parent?.filename === path.join(extension.extensionPath, "dist", "archi-agent-runtime.js")) {
        const transport = loadModule.call(this, request, parent, ...rest);
        const blocked = () => { providerRequests += 1; throw new Error("Synthetic harness blocks provider requests"); };
        return { ...transport, request: blocked, get: blocked };
      }
      return loadModule.call(this, request, parent, ...rest);
    };
    await extension.activate();
    Module._load = loadModule;
    await config().update("knowledgePackPath", undefined, target);
    await check(`create-${settings.mode}`, "saved-without-conflict", async () => {
      await create();
      assert.equal(config().get("knowledgePackPath"), destination);
      assert.deepEqual(fs.readdirSync(destination).sort(), ["actors.md", "aliases.md", "relationships.md", "rules.md", "systems.md"]);
      assert.equal(messages.length, 0, messages.at(-1));
      if (folder) {
        assert.equal(vscode.workspace.getConfiguration("archiAgent").inspect("knowledgePackPath").globalValue, undefined);
        const file = path.join(folder.uri.fsPath, ".vscode", "settings.json");
        assert.equal(JSON.parse(fs.readFileSync(file, "utf8"))["archiAgent.knowledgePackPath"], destination);
        if (vscode.workspace.workspaceFolders.length > 1) {
          assert.equal(config().inspect("knowledgePackPath").workspaceFolderValue, destination);
          const other = vscode.workspace.workspaceFolders[0];
          assert.equal(vscode.workspace.getConfiguration("archiAgent", other.uri).get("knowledgePackPath"), "");
        }
      } else assert.equal(config().inspect("knowledgePackPath").globalValue, destination);
      return "saved-without-conflict";
    });
    await check(`reopen-configure-${settings.mode}`, "panel-open-pack-preserved", async () => {
      const before = fs.readFileSync(path.join(destination, "systems.md"));
      operation = "cancel";
      prompts.length = 0;
      await open();
      assert.equal(views.panels.length,1);
      assert.equal(prompts.length,0);
      assert.equal(config().get("knowledgePackPath"), destination);
      assert.deepEqual(fs.readFileSync(path.join(destination, "systems.md")), before);
      return "panel-open-pack-preserved";
    });
    await check(`changed-setting-${settings.mode}`, "settings-conflict-before-files", async () => {
      await config().update("knowledgePackPath", undefined, target);
      fs.rmSync(destination, { recursive: true, force: true });
      messages.length = 0;
      operation = "create"; conflict = true;
      await create();
      assert.ok(messages.some((message) => message.includes("[settings-conflict]")));
      assert.equal(config().get("knowledgePackPath"), path.join(settings.root, "external-pack"));
      assert.equal(fs.existsSync(destination), false);
      return "settings-conflict-before-files";
    });
    await check(`onboarding-zero-provider-requests-${settings.mode}`, "zero-provider-requests", async () => {
      assert.equal(providerRequests, 0);
      return "zero-provider-requests";
    });
  } finally {
    views.restore();
    Module._load = loadModule;
    for (const [key, value] of Object.entries(original)) vscode.window[key] = value;
    fs.writeFileSync(settings.report, JSON.stringify({ version: vscode.version, node: process.versions.node, results }, null, 2));
  }
  if (results.some((item) => item.status !== "PASS")) throw new Error("UX3 Extension Host assertions failed");
};
