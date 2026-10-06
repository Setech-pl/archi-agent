// Test-only controlled filesystem. Shared by source tests and the extracted VSIX harness.
const assert = require("node:assert/strict");
const path = require("node:path");
const scenarioIds = ["edit-after-write-before-stat", "edit-after-write-before-digest",
  "edit-after-write-same-size",
  "edit-after-receipt", "replacement-after-write", "replacement-after-receipt",
  "unchanged-file-later-error", "partial-write-uncertain", "partial-write-foreign-edit"];

function controlledFilesystem(scenario) {
  let tick = 1;
  let inode = 10;
  const nodes = new Map();
  const unlinks = [];
  const file = "/project/knowledge/systems.md";
  let foreign = Buffer.from("foreign owner data\n");
  const make = (directory, bytes = Buffer.alloc(0)) => ({ directory, bytes, dev: 1, ino: inode++, ctimeMs: tick++, mtimeMs: tick++ });
  nodes.set("/", make(true)); nodes.set("/project", make(true));
  const errno = (code) => Object.assign(new Error(code), { code });
  const info = (node) => ({ dev: node.dev, ino: node.ino, ctimeMs: node.ctimeMs, mtimeMs: node.mtimeMs,
    size: node.bytes.length, isFile: () => !node.directory, isDirectory: () => node.directory, isSymbolicLink: () => false });
  const get = (name) => { const node = nodes.get(name); if (!node) throw errno("ENOENT"); return node; };
  const edit = (node, bytes) => { node.bytes = Buffer.from(bytes); node.ctimeMs = tick++; node.mtimeMs = tick++; };
  let ownerIdentity;
  let injected = false;
  function interfere(replace = false) {
    if (replace) nodes.set(file, make(false, foreign));
    else edit(get(file), foreign);
    ownerIdentity = info(get(file)); injected = true;
  }
  const fs = {
    async mkdir(name) { if (nodes.has(name)) throw errno("EEXIST"); get(path.dirname(name)); nodes.set(name, make(true)); },
    async lstat(name) { return info(get(name)); },
    async readdir(name) { get(name); return [...nodes.keys()].filter((item) => item !== name && path.dirname(item) === name).map((item) => path.basename(item)); },
    async readFile(name) { return Buffer.from(get(name).bytes); },
    async unlink(name) { unlinks.push(name); get(name); nodes.delete(name); },
    async rmdir(name) { if ((await fs.readdir(name)).length) throw errno("ENOTEMPTY"); nodes.delete(name); },
    async open(name, flags) {
      assert.equal(flags, "wx+");
      if (nodes.has(name)) throw errno("EEXIST");
      const node = make(false); nodes.set(name, node);
      let written = false;
      return {
        async stat() {
          if (name === file && written && !injected && ["edit-after-write-before-stat", "edit-after-write-same-size"].includes(scenario)) {
            if (scenario === "edit-after-write-same-size") foreign = Buffer.alloc(node.bytes.length, "x");
            interfere();
          }
          return info(node);
        },
        async writeFile(bytes) {
          if (path.basename(name) === "actors.md" && scenario === "unchanged-file-later-error") throw errno("ENOSPC");
          if (name === file && scenario.startsWith("partial-write")) {
            edit(node, Buffer.from(bytes).subarray(0, 12)); written = true;
            ownerIdentity = info(node);
            if (scenario === "partial-write-foreign-edit") interfere();
            throw errno("ENOSPC");
          }
          edit(node, Buffer.from(bytes)); written = true;
          if (name === file && scenario === "replacement-after-write") interfere(true);
        },
        async read(buffer, offset, length, position) {
          if (name === file && !injected && scenario === "edit-after-write-before-digest") interfere();
          const count = Math.max(0, Math.min(length, node.bytes.length - position));
          node.bytes.copy(buffer, offset, position, position + count);
          return { bytesRead: count, buffer };
        },
        async close() {}
      };
    }
  };
  return { fs, nodes, unlinks, file, get foreign() { return foreign; }, interfere, identity: () => ownerIdentity };
}

async function runScenario(scenario, runtime, memory) {
  const { file, nodes, unlinks } = memory;
  const system = { id: "synthetic-service", canonicalName: "Synthetic Service", kind: "service", description: "Synthetic test system" };
  let error;
  let receipt;
  try { receipt = await runtime.createStarterKnowledgePack("/project/knowledge", system); }
  catch (failure) { error = failure; }
  if (scenario.endsWith("after-receipt")) {
    assert.ok(receipt, "creation succeeded before external change");
    const original = receipt.files.find((item) => item.path === file);
    memory.interfere(scenario.startsWith("replacement"));
    const cleanup = await runtime.cleanupStarterKnowledgePack(receipt);
    assert.deepEqual(cleanup.preservedFiles, [file]);
    assert.match(cleanup.recovery, /Inspect the chosen directory/u);
    if (scenario.startsWith("replacement")) assert.notEqual(memory.identity().ino, original.ino);
    else assert.equal(memory.identity().ino, original.ino);
    assert.deepEqual([...nodes.keys()].sort(), ["/", "/project", "/project/knowledge", file]);
  } else {
    assert.equal(error?.code, scenario.startsWith("partial-write") || scenario === "unchanged-file-later-error" ? "storage-full" : "file-changed");
  }
  if (scenario === "unchanged-file-later-error") {
    assert.equal(nodes.has(file), false, "unchanged owned systems file removed after later error");
    assert.equal(unlinks.filter((name) => name === file).length, 1);
    return;
  }
  assert.equal(unlinks.includes(file), false, "no unlink of uncertain or foreign content");
  const current = nodes.get(file);
  assert.ok(current, "file must survive cleanup");
  const identity = memory.identity();
  assert.equal(current.dev, identity.dev);
  assert.equal(current.ino, identity.ino, "same foreign/partial file survives");
  const expected = scenario === "partial-write-uncertain" ? Buffer.from("# Systems\n\n|") : memory.foreign;
  assert.deepEqual(current.bytes, expected, "final bytes must be preserved exactly");
  if (error) {
    assert.equal(error.cleanupIncomplete, true);
    assert.match(error.recovery, /Inspect the chosen directory/u);
  }
}
module.exports = { scenarioIds, controlledFilesystem, runScenario };
