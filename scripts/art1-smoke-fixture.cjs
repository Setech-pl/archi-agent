// Synthetic architecture and controlled transport, shared only by evidence harnesses.
const fs = require("node:fs"), path = require("node:path");
exports.prepare = (root) => {
  const pack = path.join(root, "architecture"); fs.mkdirSync(pack);
  const tables = {
    "systems.md": "| id | canonical_name | kind | description |\n| --- | --- | --- | --- |\n| a | Alpha | service | Synthetic service |\n| b | Beta | database | Synthetic store |\n",
    "actors.md": "| id | canonical_name | kind | description |\n| --- | --- | --- | --- |\n",
    "relationships.md": "| from_id | to_id | interface_type | interface_name | mode | purpose |\n| --- | --- | --- | --- | --- | --- |\n| a | b | DB | Writer | synchronous | Store |\n",
    "aliases.md": "| alias | target_id |\n| --- | --- |\n", "rules.md": "| rule | from_id | to_id | reason |\n| --- | --- | --- | --- |\n"
  };
  for (const [name, text] of Object.entries(tables)) fs.writeFileSync(path.join(pack, name), text);
  const flow = path.join(root, "flow.md");
  fs.writeFileSync(flow, "---\ndiagram_name: synthetic-art1\nflow_name: Synthetic ART1\nauthor: Test\nlanguage: en\n---\nAlpha stores data in Beta.\n");
  return { pack, flow };
};
exports.answer = (input, component = false) => input.plantUml ? { accepted: true, confirmedUserStatedFactIds: [], violations: [] } :
  component ? { version: 1, elementIds: input.snapshot.elements.map((e) => e.id), groundedDependencies: input.relationshipCatalog.map((e) => e.dependencyId), userStatedDependencies: [] } :
    { version: 3, groundedSteps: [{ order: 1, operationId: "op-0001", label: "Zażółć gęślą jaźń" }], userStatedSteps: [] };
