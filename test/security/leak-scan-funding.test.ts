import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const scannerPath = fileURLToPath(new URL("../../scripts/leak-scan.mjs", import.meta.url));
const newline = String.fromCharCode(10);

// Host names and URLs are assembled at run time, so this file never contains a contiguous domain
// that the project leak scan would itself report.
const domain = (...labels: string[]): string => labels.join(".");
const httpsUrl = (host: string, pathPart = "sample-project"): string =>
  ["https:", "", host, pathPart].join("/");
const collectiveHost = domain("opencollective", "com");
const tideliftHost = domain("tidelift", "com");

const rulesText = [
  "## A. Synthetic content rules",
  "A2  literal  synthetic-forbidden-literal",
  "A10 regex  domains outside the allowlist below",
  "",
  "# Allowed domains",
  domain("registry", "npmjs", "org"),
  "",
  "## B. Synthetic path rules",
  "B1  dist/**",
  ""
].join(newline);

interface ScanOutcome {
  exitCode: number | null;
  findings: Map<string, number>;
  exemptions: Map<string, number>;
  summary: string | undefined;
}

const workspaces: string[] = [];

afterEach(() => {
  for (const workspace of workspaces.splice(0)) {
    rmSync(workspace, { recursive: true, force: true });
  }
});

function scan(files: Record<string, string>): ScanOutcome {
  const workspace = mkdtempSync(path.join(tmpdir(), "archground-a10-"));
  workspaces.push(workspace);
  const root = path.join(workspace, "project");
  mkdirSync(root);

  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(root, ...relativePath.split("/"));
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content, "utf8");
  }

  const rulesPath = path.join(workspace, "rules.txt");
  writeFileSync(rulesPath, rulesText, "utf8");
  const result = spawnSync(process.execPath, [scannerPath, "--root", root, "--rules", rulesPath], {
    encoding: "utf8"
  });
  const findings = new Map<string, number>();
  const exemptions = new Map<string, number>();
  let summary: string | undefined;

  for (const rawLine of result.stdout.split(newline)) {
    const line = rawLine.trim();
    const fields = line.split(" ");
    const field = (prefix: string): string =>
      fields.find((item) => item.startsWith(prefix))?.slice(prefix.length) ?? "";

    if (fields[0] === "FINDING") {
      findings.set(`${fields[1] ?? ""} ${fields[2] ?? ""}`, Number(field("count=")));
    } else if (fields[0] === "EXEMPT") {
      const host = field("host=");
      exemptions.set(host, (exemptions.get(host) ?? 0) + Number(field("count=")));
    } else if (line.startsWith("leak-scan: A10 raw=")) {
      summary = line.slice("leak-scan: ".length);
    }
  }

  return { exitCode: result.status, findings, exemptions, summary };
}

function lockfile(packages: Record<string, Record<string, unknown>>): string {
  return JSON.stringify(
    {
      name: "synthetic-project",
      version: "1.0.0",
      lockfileVersion: 3,
      requires: true,
      packages: { "": { name: "synthetic-project", version: "1.0.0" }, ...packages }
    },
    null,
    2
  );
}

function expectExempt(outcome: ScanOutcome, host: string, count: number): void {
  expect(outcome.exitCode).toBe(0);
  expect(outcome.findings.size).toBe(0);
  expect(outcome.exemptions.get(host)).toBe(count);
  expect(outcome.summary).toBe(`A10 raw=${count} exempt=${count} actionable=0`);
}

function expectA10(outcome: ScanOutcome, relativePath: string, count: number): void {
  expect(outcome.exitCode).toBe(1);
  expect(outcome.findings.get(`A10 ${relativePath}`)).toBe(count);
}

// Every test here spawns the scanner as a subprocess. The local 15-second timeout covers intermittent
// subprocess scheduling under full-suite CPU contention, not expected scanner execution time (about
// 0.1 to 0.2 seconds per scan in isolation). No assertion depends on this value.
describe("leak scan A10 exception for package-lock funding metadata", { timeout: 15_000 }, () => {
  it("exempts an approved host given as a plain funding string", () => {
    const outcome = scan({
      "package-lock.json": lockfile({ "node_modules/a": { version: "1.0.0", funding: httpsUrl(collectiveHost) } })
    });
    expectExempt(outcome, collectiveHost, 1);
  });

  it("exempts an approved host given as funding.url", () => {
    const outcome = scan({
      "package-lock.json": lockfile({
        "node_modules/a": { version: "1.0.0", funding: { type: "opencollective", url: httpsUrl(collectiveHost) } }
      })
    });
    expectExempt(outcome, collectiveHost, 1);
  });

  it("exempts approved hosts inside a funding array", () => {
    const outcome = scan({
      "package-lock.json": lockfile({
        "node_modules/a": {
          version: "1.0.0",
          funding: [httpsUrl(collectiveHost, "one"), { type: "individual", url: httpsUrl(collectiveHost, "two") }]
        }
      })
    });
    expectExempt(outcome, collectiveHost, 2);
  });

  it("exempts the second approved host", () => {
    const outcome = scan({
      "package-lock.json": lockfile({ "node_modules/a": { version: "1.0.0", funding: { url: httpsUrl(tideliftHost) } } })
    });
    expectExempt(outcome, tideliftHost, 1);
  });

  it("reports an approved host in a resolved field", () => {
    const outcome = scan({
      "package-lock.json": lockfile({
        "node_modules/a": { version: "1.0.0", resolved: httpsUrl(collectiveHost, "a-1.0.0.tgz") }
      })
    });
    expectA10(outcome, "package-lock.json", 1);
    expect(outcome.exemptions.size).toBe(0);
  });

  it("reports an approved host in any other lockfile field", () => {
    const outcome = scan({
      "package-lock.json": lockfile({ "node_modules/a": { version: "1.0.0", homepage: httpsUrl(collectiveHost) } })
    });
    expectA10(outcome, "package-lock.json", 1);
  });

  it("reports an approved host in a TypeScript file", () => {
    const outcome = scan({ "src/sample.ts": `export const link = "${httpsUrl(collectiveHost)}";` + newline });
    expectA10(outcome, "src/sample.ts", 1);
  });

  it("reports an untrusted host inside funding", () => {
    const outcome = scan({
      "package-lock.json": lockfile({
        "node_modules/a": { version: "1.0.0", funding: httpsUrl(domain("donations-sample", "com")) }
      })
    });
    expectA10(outcome, "package-lock.json", 1);
    expect(outcome.exemptions.size).toBe(0);
  });

  it("reports an internal domain inside funding", () => {
    const outcome = scan({
      "package-lock.json": lockfile({ "node_modules/a": { version: "1.0.0", funding: httpsUrl(domain("billing", "corp")) } })
    });
    expectA10(outcome, "package-lock.json", 1);
  });

  it("reports an approved host over plain http", () => {
    const url = ["http:", "", collectiveHost, "sample-project"].join("/");
    const outcome = scan({ "package-lock.json": lockfile({ "node_modules/a": { version: "1.0.0", funding: url } }) });
    expectA10(outcome, "package-lock.json", 1);
  });

  it("reports an approved host with user information", () => {
    const url = httpsUrl(["someone:sample", collectiveHost].join("@"));
    const outcome = scan({ "package-lock.json": lockfile({ "node_modules/a": { version: "1.0.0", funding: url } }) });
    expectA10(outcome, "package-lock.json", 1);
  });

  it("reports an approved host with a custom port", () => {
    const outcome = scan({
      "package-lock.json": lockfile({ "node_modules/a": { version: "1.0.0", funding: httpsUrl(`${collectiveHost}:8443`) } })
    });
    expectA10(outcome, "package-lock.json", 1);
  });

  it("reports look-alike domains and subdomains of an approved host", () => {
    const outcome = scan({
      "package-lock.json": lockfile({
        "node_modules/a": { version: "1.0.0", funding: httpsUrl(domain("opencollective", "com", "funding-sample", "io")) },
        "node_modules/b": { version: "1.0.0", funding: httpsUrl(domain("pay", "opencollective", "com")) }
      })
    });
    expectA10(outcome, "package-lock.json", 2);
    expect(outcome.exemptions.size).toBe(0);
  });

  it("fails closed on a malformed package-lock.json", () => {
    const outcome = scan({
      "package-lock.json": `{"packages": {"node_modules/a": {"funding": "${httpsUrl(collectiveHost)}"`
    });
    expectA10(outcome, "package-lock.json", 1);
    expect(outcome.findings.get("LOCKFILE_UNVERIFIED package-lock.json")).toBe(1);
    expect(outcome.exemptions.size).toBe(0);
  });

  it("fails closed on a malformed package-lock.json without domain matches", () => {
    const outcome = scan({ "package-lock.json": "{ not json" });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.findings.get("LOCKFILE_UNVERIFIED package-lock.json")).toBe(1);
  });

  it("does not treat plain text mentioning funding as funding metadata", () => {
    expectA10(scan({ "notes.md": `funding: ${httpsUrl(collectiveHost)}` + newline }), "notes.md", 1);
    const described = scan({
      "package-lock.json": lockfile({
        "node_modules/a": { version: "1.0.0", description: `funding ${httpsUrl(collectiveHost)}` }
      })
    });
    expectA10(described, "package-lock.json", 1);
  });

  it("exempts only funding when a malicious resolved value shares the file", () => {
    const outcome = scan({
      "package-lock.json": lockfile({
        "node_modules/a": { version: "1.0.0", funding: httpsUrl(collectiveHost) },
        "node_modules/b": { version: "1.0.0", resolved: httpsUrl(domain("mirror-sample", "com"), "b-1.0.0.tgz") }
      })
    });
    expectA10(outcome, "package-lock.json", 1);
    expect(outcome.exemptions.get(collectiveHost)).toBe(1);
    expect(outcome.summary).toBe("A10 raw=2 exempt=1 actionable=1");
  });

  it("applies the exception only to the root package-lock.json", () => {
    const outcome = scan({
      "nested/package-lock.json": lockfile({ "node_modules/a": { version: "1.0.0", funding: httpsUrl(collectiveHost) } })
    });
    expectA10(outcome, "nested/package-lock.json", 1);
  });

  it("reports nothing for a clean synthetic tree", () => {
    const outcome = scan({ "readme.md": "nothing to report" + newline });
    expect(outcome.exitCode).toBe(0);
    expect(outcome.findings.size).toBe(0);
    expect(outcome.summary).toBe("A10 raw=0 exempt=0 actionable=0");
  });
});
