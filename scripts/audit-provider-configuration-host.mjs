// Targeted ABA checks in isolated real VS Code settings; no cloud/network calls.
import { build } from "esbuild";
import { prepareVscode, vscodeBinary } from "./ux3-vscode-smoke.mjs";
import { mkdirSync, writeFileSync, copyFileSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
const [vsixArg, outArg] = process.argv.slice(2), out = path.resolve(outArg);
mkdirSync(out, { recursive: true });
// Production picker/guard exports for direct status/lifecycle assertions in the real host.
await build({ stdin: { contents: `export { selectModel } from './vscode-extension/src/commands/local-provider-selection.ts';
export * from './vscode-extension/src/provider-configuration.ts';
export { createArchiAgentRuntime } from './src/runtime/index.ts';`, resolveDir: process.cwd() },
  bundle: true, platform: "node", format: "cjs", target: "node20", external: ["vscode"], outfile: path.join(out, "host-api.cjs") });
const environment = prepareVscode(path.resolve(vsixArg), "audit-ABA"), harness = path.join(environment.root, "harness");
mkdirSync(harness);
writeFileSync(path.join(harness, "package.json"), JSON.stringify({ name: "audit-aba-harness", publisher: "local", version: "0.0.1", engines: { vscode: "^1.91.0" }, main: "./extension.cjs" }));
writeFileSync(path.join(harness, "extension.cjs"), "exports.activate=()=>{};\n");
copyFileSync(path.join(out, "host-api.cjs"), path.join(harness, "host-api.cjs"));
copyFileSync(new URL("./audit-provider-configuration-host.cjs", import.meta.url), path.join(harness, "test.cjs"));
const left = path.join(environment.root, "left"), right = path.join(environment.root, "right");
mkdirSync(left); mkdirSync(right);
const workspace = path.join(environment.root, "synthetic.code-workspace");
writeFileSync(workspace, JSON.stringify({ folders: [{ path: left }, { path: right }] }));
const config = path.join(harness, "config.json"), report = path.join(out, "host-report.json");
writeFileSync(config, JSON.stringify({ report }));
writeFileSync(path.join(out, "host-environment.json"), JSON.stringify(environment, null, 2));
const code = await new Promise((resolve, reject) => {
  const child = spawn(vscodeBinary, ["--user-data-dir", environment.user, "--extensions-dir", environment.extensions,
    "--extensionDevelopmentPath=" + harness, "--extensionTestsPath=" + path.join(harness, "test.cjs"), "--skip-welcome", "--skip-release-notes", workspace],
    { env: { ...process.env, ARCHI_AUDIT_HOST_CONFIG: config }, stdio: ["ignore", "pipe", "pipe"] });
  const logs = []; child.stdout.on("data", b => logs.push(b)); child.stderr.on("data", b => logs.push(b));
  const timer = setTimeout(() => child.kill("SIGTERM"), 60000);
  child.once("error", reject); child.once("close", code => { clearTimeout(timer); writeFileSync(path.join(out, "host.log"), Buffer.concat(logs)); resolve(code); });
});
const results = JSON.parse(readFileSync(report, "utf8")).results;
console.log(`Real Extension Host: ${results.filter(r => r.status === "PASS").length}/${results.length} PASS`);
if (code !== 0 || results.some(r => r.status !== "PASS")) process.exitCode = 1;
