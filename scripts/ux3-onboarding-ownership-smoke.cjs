// Execute the unmodified packaged CJS runtime with a controlled filesystem at its Node boundary.
const { readFileSync } = require("node:fs");
const { createRequire } = require("node:module");
const vm = require("node:vm");
const { scenarioIds, controlledFilesystem, runScenario } = require("./ux3-onboarding-ownership-fixture.cjs");

async function ownershipSmoke(bundle) {
  const results = [];
  const requireBundle = createRequire(bundle);
  const code = readFileSync(bundle, "utf8");
  for (const id of scenarioIds) {
    const memory = controlledFilesystem(id);
    const module = { exports: {} };
    const load = vm.runInThisContext(`(function(require, module, exports, __filename, __dirname) {${code}\n})`, { filename: bundle });
    load((name) => name === "node:fs/promises" ? memory.fs : requireBundle(name), module, module.exports, bundle, require("node:path").dirname(bundle));
    try {
      await runScenario(id, module.exports, memory);
      results.push({ id: `ownership-${id}`, layer: "packaged-runtime", status: "PASS", expected: "exact bytes and identity preserved; no foreign unlink", actual: "all ownership assertions passed" });
    } catch (error) {
      results.push({ id: `ownership-${id}`, layer: "packaged-runtime", status: "FAIL", expected: "exact bytes and identity preserved; no foreign unlink",
        actual: error.message, errorCode: "ownership-assertion-failed", unlinks: memory.unlinks,
        finalFile: memory.nodes.has(memory.file) ? { ...memory.nodes.get(memory.file), bytes: memory.nodes.get(memory.file).bytes.toString("utf8") } : null });
    }
  }
  return results;
}
module.exports = { ownershipSmoke };
