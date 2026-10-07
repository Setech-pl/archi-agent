import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync, copyFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { openVsix } from "../vscode-extension/scripts/vsix-zip.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
export const vscodeBinary = "/Applications/Visual Studio Code.app/Contents/MacOS/Code";
export function prepareVscode(vsix, mode) {
  // Canonical and short: macOS TMPDIR's physical path can exceed the Unix socket limit.
  const root = realpathSync(mkdtempSync(path.join(process.platform === "darwin" ? "/private/tmp" : realpathSync(tmpdir()), "ux3-")));
  const user = path.join(root, "user");
  const extensions = path.join(root, "extensions");
  mkdirSync(path.join(user, "User"), { recursive: true });
  mkdirSync(extensions);
  writeFileSync(path.join(user, "User/settings.json"), JSON.stringify({
    "workbench.startupEditor": "none", "security.workspace.trust.enabled": false,
    "chat.disableAIFeatures": true,
    "telemetry.telemetryLevel": "off", "update.mode": "none", "extensions.autoCheckUpdates": false,
    "extensions.autoUpdate": false, "window.title": `UX3 ${mode} ${path.basename(root)}`
  }));
  const installation = spawnSync("code", ["--user-data-dir", user, "--extensions-dir", extensions,
    "--install-extension", vsix], { encoding: "utf8", timeout: 60000 });
  writeFileSync(path.join(root, "install.log"), `${installation.stdout ?? ""}${installation.stderr ?? ""}`);
  if (installation.status !== 0) throw new Error("VSIX installation failed");
  const archive = openVsix(vsix);
  const manifest = JSON.parse(archive.read("extension/package.json").toString("utf8"));
  const extensionRoot = path.join(extensions, `${manifest.publisher}.${manifest.name}-${manifest.version}`);
  const installedManifest = JSON.parse(readFileSync(path.join(extensionRoot, "package.json"), "utf8"));
  delete installedManifest.__metadata;
  if (!isDeepStrictEqual(installedManifest, manifest)) throw new Error("Installed manifest differs from VSIX");
  for (const entry of archive.entries.filter((entry) => entry.name.startsWith("extension/") && entry.name !== "extension/package.json").map((entry) => entry.name.slice("extension/".length))) {
    if (!archive.read(`extension/${entry}`).equals(readFileSync(path.join(extensionRoot, entry))))
      throw new Error("Installed candidate differs from VSIX");
  }
  return { root, user, extensions, extensionRoot };
}
function startHost(args, env, logPath) {
  return new Promise((resolve) => {
    const child = spawn(vscodeBinary, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    const output = [];
    child.stdout.on("data", (data) => output.push(data));
    child.stderr.on("data", (data) => output.push(data));
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, 60000);
    child.once("error", () => resolve(null));
    child.once("close", (code) => { clearTimeout(timer); writeFileSync(logPath, Buffer.concat(output)); resolve(timedOut ? null : code); });
  });
}
export async function runHostSmoke(vsix, out, testScript = "ux3-extension-host.cjs", reportPrefix = "host", extraFiles = []) {
  const results = [];
  if (process.platform !== "darwin" || !existsSync(vscodeBinary)) return [{ id: "extension-host-settings", layer: "Extension Host",
    status: "NOT_RUN", expected: "real VS Code settings", actual: "local macOS VS Code binary unavailable", errorCode: "vscode-unavailable" }];
  for (const mode of ["single-folder", "multi-root", "global"]) {
    const environment = prepareVscode(vsix, mode);
    const harness = path.join(environment.root, "harness"); mkdirSync(harness);
    writeFileSync(path.join(harness, "package.json"), JSON.stringify({ name: "ux3-test-harness", publisher: "local", version: "0.0.1",
      engines: { vscode: "^1.91.0" }, main: "./extension.cjs", activationEvents: [] }));
    writeFileSync(path.join(harness, "extension.cjs"), "exports.activate = () => {};\n");
    copyFileSync(path.join(scriptDirectory, testScript), path.join(harness, "test.cjs"));
    for (const file of extraFiles) copyFileSync(path.join(scriptDirectory, file), path.join(harness, file));
    const reportPath = path.join(out, `${reportPrefix}-${mode}.json`);
    const configPath = path.join(harness, "config.json");
    writeFileSync(configPath, JSON.stringify({ root: environment.root, mode, report: reportPath }));
    let workspace;
    if (mode !== "global") {
      const left = path.join(environment.root, "project-left"); mkdirSync(left);
      workspace = left;
      if (mode === "multi-root") {
        const right = path.join(environment.root, "project-right"); mkdirSync(right);
        workspace = path.join(environment.root, "synthetic.code-workspace");
        writeFileSync(workspace, JSON.stringify({ folders: [{ path: left }, { path: right }] }));
      }
    }
    const exitCode = await startHost(["--user-data-dir", environment.user, "--extensions-dir", environment.extensions,
      `--extensionDevelopmentPath=${harness}`, `--extensionTestsPath=${path.join(harness, "test.cjs")}`,
      "--skip-welcome", "--skip-release-notes", ...(workspace ? [workspace] : [])],
      { ...process.env, UX3_HOST_CONFIG: configPath }, path.join(out, `${reportPrefix}-${mode}.log`));
    if (existsSync(reportPath)) results.push(...JSON.parse(readFileSync(reportPath, "utf8")).results);
    else results.push({ id: `${reportPrefix}-${mode}`, layer: "Extension Host", status: "NOT_RUN", expected: "host settings assertions",
      actual: "Extension Host did not write its report; see host log", errorCode: "host-start-failed" });
    if (exitCode !== 0) results.push({ id: `${reportPrefix}-completion-${mode}`, layer: "Extension Host", status: "FAIL",
      expected: "test host exits with code 0", actual: `exit ${exitCode ?? "timeout or signal"}`, errorCode: "host-run-failed" });
  }
  return results;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const output = path.join(path.resolve(process.argv[3]), `diagnostic-host-${Date.now()}`); mkdirSync(output);
  const results = await runHostSmoke(path.resolve(process.argv[2]), output);
  writeFileSync(path.join(output, "host-report.json"), JSON.stringify(results, null, 2));
  process.stdout.write(`Report: ${output}\n`);
  process.stdout.write(JSON.stringify(results, null, 2) + "\n");
  if (results.some((item) => item.status !== "PASS")) process.exitCode = 1;
}
