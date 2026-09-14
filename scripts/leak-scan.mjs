#!/usr/bin/env node
// ArchGround leak scanner.
//
// Scans a project tree for forbidden content and forbidden artifacts using an
// external rules file. The scanner uses built-in Node.js modules only, performs
// no network access, never follows symbolic links or junctions, and never
// prints matched text: findings are reported as rule identifier, relative path
// and match count.
//
// Usage:
//   node scripts/leak-scan.mjs --root <dir> --rules <file> [--private-tokens <file>]
//
// Exit codes:
//   0  clean scan
//   1  at least one finding
//   2  usage error, malformed rules or scan failure

import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const MAX_FILES = 20000;
const MAX_RULE_FILE_BYTES = 512 * 1024;
const MAX_TOKEN_FILE_BYTES = 512 * 1024;

// Generated and dependency directories. They are excluded from version
// control, so their contents are not scanned; their presence is reported.
const SKIPPED_ROOT_DIRECTORIES = new Set([
  ".git",
  ".archground",
  "architecture-diagrams",
  "build",
  "coverage",
  "dist",
  "out"
]);
const SKIPPED_DIRECTORY_NAMES = new Set(["node_modules"]);

// No binary file type is approved yet.
const ALLOWED_BINARY_EXTENSIONS = new Set();

const DIACRITIC_EXEMPT_PATTERNS = [
  "src/core/render/legend.ts",
  "docs/**",
  "test/unit/render/legend.test.ts"
].map(globToRegExp);
const DIACRITIC_PATTERN =
  /[\u0104\u0105\u0106\u0107\u0118\u0119\u0141\u0142\u0143\u0144\u00d3\u00f3\u015a\u015b\u0179\u017a\u017b\u017c]/gu;
const DOMAIN_CANDIDATE_PATTERN =
  /\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:ai|app|cloud|com|corp|dev|eu|intra|internal|io|lan|local|net|org|pl)\b/giu;
const ARGUMENT_NAMES = new Map([
  ["--root", "root"],
  ["--rules", "rules"],
  ["--private-tokens", "privateTokens"]
]);
const USAGE =
  "usage: node scripts/leak-scan.mjs --root <dir> --rules <file> [--private-tokens <file>]";

// Owner-approved A10 exception (Phase 3B.1). npm records public open-source funding links in the
// root package-lock.json. A domain match there is exempt only when it is the host of an https URL
// stored in packages.<entry>.funding (as a string, as funding.url, as an array element or as an array
// element url), the URL has no credentials and no custom port, the host is exactly one of the hosts
// below, and the parsed JSON accounts for every match found in the raw text. Every other A10 match
// stays actionable. Host names are assembled from labels so this file contains no literal domain.
const LOCKFILE_PATH = "package-lock.json";
const LOCKFILE_FUNDING_HOSTS = new Set(
  [["opencollective", "com"], ["tidelift", "com"]].map((labels) => labels.join("."))
);

class ScanFailure extends Error {}

process.exitCode = main(process.argv.slice(2));

function main(argv) {
  let options;

  try {
    options = parseArguments(argv);
  } catch (error) {
    return fail(`${messageOf(error)}; ${USAGE}`);
  }

  try {
    const root = resolveRoot(options.root);
    const rules = parseRules(readBoundedText(options.rules, MAX_RULE_FILE_BYTES, "rules file"));
    const privateTokenPatterns =
      options.privateTokens === undefined
        ? undefined
        : loadPrivateTokenPatterns(options.privateTokens, root);
    const result = scan(root, rules, privateTokenPatterns);

    printResult(result, rules, privateTokenPatterns !== undefined);
    return result.findings.length === 0 ? 0 : 1;
  } catch (error) {
    return fail(messageOf(error));
  }
}

function parseArguments(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const name = ARGUMENT_NAMES.get(flag);
    const value = argv[index + 1];

    if (name === undefined) {
      throw new ScanFailure(`unknown argument at position ${index + 1}`);
    }

    if (value === undefined || value.startsWith("--")) {
      throw new ScanFailure(`missing value for ${flag}`);
    }

    if (Object.hasOwn(options, name)) {
      throw new ScanFailure(`duplicate argument ${flag}`);
    }

    options[name] = value;
  }

  if (options.root === undefined || options.rules === undefined) {
    throw new ScanFailure("--root and --rules are required");
  }

  return options;
}

function resolveRoot(input) {
  const absolute = path.resolve(input);
  let info;

  try {
    info = lstatSync(absolute);
  } catch {
    throw new ScanFailure("root does not exist or cannot be read");
  }

  if (info.isSymbolicLink()) {
    throw new ScanFailure("root must not be a symbolic link or junction");
  }

  if (!info.isDirectory()) {
    throw new ScanFailure("root must be a directory");
  }

  return realpathSync(absolute);
}

function readBoundedText(file, maxBytes, label) {
  const absolute = path.resolve(file);
  let info;

  try {
    info = lstatSync(absolute);
  } catch {
    throw new ScanFailure(`${label} does not exist or cannot be read`);
  }

  if (info.isSymbolicLink() || !info.isFile()) {
    throw new ScanFailure(`${label} must be a regular file`);
  }

  if (info.size > maxBytes) {
    throw new ScanFailure(`${label} exceeds ${maxBytes} bytes`);
  }

  const text = decodeText(readFileSync(absolute));

  if (text === undefined) {
    throw new ScanFailure(`${label} is not UTF-8 text`);
  }

  return text;
}

function loadPrivateTokenPatterns(file, root) {
  const absolute = path.resolve(file);
  let resolved;

  try {
    resolved = realpathSync(absolute);
  } catch {
    throw new ScanFailure("private token file does not exist or cannot be read");
  }

  if (isInside(root, resolved)) {
    throw new ScanFailure("private token file must be stored outside the scanned root");
  }

  const entries = readBoundedText(absolute, MAX_TOKEN_FILE_BYTES, "private token file")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  if (entries.length === 0) {
    throw new ScanFailure("private token file contains no entries");
  }

  return entries.map((entry) => new RegExp(escapeRegExp(entry), "giu"));
}

function parseRules(text) {
  const rules = {
    content: [],
    paths: [],
    metadata: [],
    manual: [],
    allowedDomains: new Set(),
    explicitAllowed: [],
    domainRuleId: undefined,
    privateTokenRuleId: undefined,
    diacriticRuleId: undefined,
    binaryRuleId: undefined,
    lfsRuleId: undefined
  };
  const seenIds = new Set();
  let section = "";
  let inAllowedDomains = false;

  text.split(/\r?\n/).forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const line = rawLine.trim();
    const header = /^##\s+([A-Z])\./.exec(line);

    if (header !== null) {
      section = header[1];
      inAllowedDomains = false;
      return;
    }

    if (/^#\s*allowed domains\b/i.test(line)) {
      inAllowedDomains = true;
      return;
    }

    if (line === "") {
      inAllowedDomains = false;
      return;
    }

    if (line.startsWith("#")) {
      return;
    }

    if (inAllowedDomains) {
      const domain = stripComment(line).toLowerCase();

      if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(domain)) {
        throw malformed(lineNumber, "invalid allowed domain");
      }

      rules.allowedDomains.add(domain);
      return;
    }

    if (section === "C") {
      const allowance = stripComment(line).split(/\s+/)[0] ?? "";
      assertPathPattern(allowance, lineNumber);
      rules.explicitAllowed.push(globToRegExp(allowance));
      return;
    }

    const rule = /^([A-Z])(\d+)\s+(.+)$/.exec(line);

    if (rule === null || rule[1] !== section) {
      throw malformed(lineNumber, "expected a rule identifier of the current section");
    }

    const id = `${rule[1]}${rule[2]}`;

    if (seenIds.has(id)) {
      throw malformed(lineNumber, `duplicate rule identifier ${id}`);
    }

    seenIds.add(id);
    const [body, comment] = splitComment(rule[3]);

    if (section === "A") {
      parseContentRule(rules, id, body, comment, lineNumber);
    } else if (section === "B") {
      parsePathRule(rules, id, body, lineNumber);
    } else if (section === "D") {
      parseMetadataRule(rules, id, body);
    } else {
      throw malformed(lineNumber, "rule outside a known section");
    }
  });

  if (rules.content.length === 0) {
    throw malformed(0, "no machine-checkable content rules");
  }

  if (rules.paths.length === 0) {
    throw malformed(0, "no path rules");
  }

  if (rules.domainRuleId !== undefined && rules.allowedDomains.size === 0) {
    throw malformed(0, "domain rule without an allowed-domain list");
  }

  return rules;
}

function parseContentRule(rules, id, body, comment, lineNumber) {
  const typed = /^(regex|literal)\s+(.+)$/i.exec(body);

  if (typed !== null) {
    const kind = typed[1].toLowerCase();
    const source = typed[2].trim();

    if (kind === "literal") {
      rules.content.push({ id, pattern: new RegExp(escapeRegExp(source), "gi"), exceptions: [] });
      return;
    }

    if (/^domains outside the allowlist\b/i.test(source)) {
      rules.domainRuleId = id;
      return;
    }

    rules.content.push({
      id,
      pattern: compilePattern(source, lineNumber),
      exceptions: parseExceptions(comment)
    });
    return;
  }

  if (/^tokens from the external confidential list\b/i.test(body)) {
    rules.privateTokenRuleId = id;
  } else if (/^polish diacritics outside\b/i.test(body)) {
    rules.diacriticRuleId = id;
  } else {
    rules.manual.push(id);
  }
}

function compilePattern(source, lineNumber) {
  let flags = "gm";
  let pattern = source;

  if (pattern.startsWith("(?i)")) {
    flags += "i";
    pattern = pattern.slice(4);
  }

  if (/\(\?[A-Za-z]/.test(pattern)) {
    throw malformed(lineNumber, "unsupported inline flag");
  }

  let compiled;

  try {
    compiled = new RegExp(pattern, flags);
  } catch {
    throw malformed(lineNumber, "pattern does not compile");
  }

  if (new RegExp(pattern, flags.replace("g", "")).test("")) {
    throw malformed(lineNumber, "pattern matches empty text");
  }

  return compiled;
}

function parseExceptions(comment) {
  const allow = /\ballow\s+(.+)$/i.exec(comment);

  if (allow === null) {
    return [];
  }

  return allow[1]
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => (entry.endsWith("*") ? { prefix: entry.slice(0, -1) } : { exact: entry }));
}

function parsePathRule(rules, id, body, lineNumber) {
  let accepted = 0;

  for (const item of body.split(",")) {
    const words = item.trim().split(/\s+/).filter((word) => word.length > 0);
    const candidate = words[0];
    const remainder = words.slice(1).join(" ");

    if (candidate === undefined || (remainder !== "" && !remainder.startsWith("("))) {
      continue;
    }

    assertPathPattern(candidate, lineNumber);
    rules.paths.push({ id, glob: candidate, pattern: globToRegExp(candidate) });
    accepted += 1;
  }

  if (accepted > 0) {
    return;
  }

  if (/large-file-storage/i.test(body)) {
    rules.lfsRuleId = id;
  } else if (/binary or executable/i.test(body)) {
    rules.binaryRuleId = id;
  } else {
    rules.manual.push(id);
  }
}

function assertPathPattern(value, lineNumber) {
  if (!/^[A-Za-z0-9._*/-]+$/.test(value) || value.includes("..")) {
    throw malformed(lineNumber, "invalid path pattern");
  }
}

function parseMetadataRule(rules, id, body) {
  const contains = /^package\.json contains "([^"]+)":\s*(.+)$/.exec(body);

  if (contains !== null) {
    rules.metadata.push({ id, key: contains[1], expected: parseExpectedValue(contains[2]) });
    return;
  }

  const equals = /^package\.json ([A-Za-z0-9_.]+) is (\S+)/.exec(body);

  if (equals !== null) {
    rules.metadata.push({ id, key: equals[1], expected: equals[2] });
    return;
  }

  rules.manual.push(id);
}

function parseExpectedValue(text) {
  try {
    return JSON.parse(text.trim());
  } catch {
    return text.trim();
  }
}

function scan(root, rules, privateTokenPatterns) {
  const files = [];
  const walkState = { symlinks: [], special: [], skipped: [] };
  const findings = new Map();
  const add = (id, relativePath, count) => {
    if (count > 0) {
      const key = `${id}\u0000${relativePath}`;
      findings.set(key, (findings.get(key) ?? 0) + count);
    }
  };

  const domainStats = { raw: 0, actionable: 0, exempt: new Map() };
  const exempt = (relativePath, host, count) => {
    const key = JSON.stringify([relativePath, host]);
    domainStats.exempt.set(key, (domainStats.exempt.get(key) ?? 0) + count);
  };
  const contentContext = { domainStats, exempt };

  walk(root, "", walkState, files);

  for (const entry of walkState.symlinks) {
    add("SYMLINK", entry, 1);
  }

  for (const entry of walkState.special) {
    add("SPECIAL_FILE", entry, 1);
  }

  for (const rule of rules.paths) {
    if (rule.glob.startsWith(".git/")) {
      const prefix = rule.glob.split("*")[0].replace(/\/+$/, "");

      if (existsWithoutFollowing(path.join(root, ...prefix.split("/")))) {
        add(rule.id, prefix, 1);
      }
    }
  }

  let bytesScanned = 0;

  for (const file of files) {
    for (const rule of rules.paths) {
      if (rule.pattern.test(file.relativePath)) {
        add(rule.id, file.relativePath, 1);
      }
    }

    if (!rules.explicitAllowed.some((pattern) => pattern.test(file.relativePath))) {
      scanText(file.relativePath, file.relativePath, rules, privateTokenPatterns, add, null);
    }

    if (file.size > MAX_FILE_BYTES) {
      add("FILE_SIZE_LIMIT", file.relativePath, 1);
      continue;
    }

    bytesScanned += file.size;

    if (bytesScanned > MAX_TOTAL_BYTES) {
      throw new ScanFailure("total scanned bytes limit exceeded");
    }

    const bytes = readFileSync(file.absolutePath);

    if (bytes.length > MAX_FILE_BYTES) {
      add("FILE_SIZE_LIMIT", file.relativePath, 1);
      continue;
    }

    if (hasByteOrderMark(bytes)) {
      add("UTF8_BOM", file.relativePath, 1);
    }

    const text = decodeText(bytes);

    if (text === undefined) {
      if (!ALLOWED_BINARY_EXTENSIONS.has(path.extname(file.relativePath).toLowerCase())) {
        add(rules.binaryRuleId ?? "BINARY_FILE", file.relativePath, 1);
      }

      continue;
    }

    scanText(text, file.relativePath, rules, privateTokenPatterns, add, contentContext);

    if (rules.lfsRuleId !== undefined && path.posix.basename(file.relativePath) === ".gitattributes") {
      add(rules.lfsRuleId, file.relativePath, countMatches(/filter\s*=\s*lfs/gi, text));
    }
  }

  const notApplicable = checkMetadata(root, rules, add);

  return {
    filesScanned: files.length,
    bytesScanned,
    skipped: walkState.skipped,
    domainStats: { raw: domainStats.raw, actionable: domainStats.actionable },
    domainExemptions: [...domainStats.exempt.entries()]
      .map(([key, count]) => {
        const [relativePath, host] = JSON.parse(key);
        return { relativePath, host, count };
      })
      .sort(
        (left, right) =>
          stableCompare(left.relativePath, right.relativePath) || stableCompare(left.host, right.host)
      ),
    notApplicable,
    findings: [...findings.entries()]
      .map(([key, count]) => {
        const [id, relativePath] = key.split("\u0000");
        return { id, relativePath, count };
      })
      .sort(
        (left, right) =>
          compareRuleIds(left.id, right.id) || stableCompare(left.relativePath, right.relativePath)
      )
  };
}

function walk(root, relativeDirectory, state, files) {
  const absoluteDirectory =
    relativeDirectory === "" ? root : path.join(root, ...relativeDirectory.split("/"));
  const names = readdirSync(absoluteDirectory).sort(stableCompare);

  for (const name of names) {
    const relativePath = relativeDirectory === "" ? name : `${relativeDirectory}/${name}`;
    const absolutePath = path.join(absoluteDirectory, name);

    if (!isInside(root, absolutePath)) {
      throw new ScanFailure("traversal outside the scanned root detected");
    }

    const info = lstatSync(absolutePath);

    if (info.isSymbolicLink()) {
      state.symlinks.push(relativePath);
    } else if (info.isDirectory()) {
      if (
        (relativeDirectory === "" && SKIPPED_ROOT_DIRECTORIES.has(name)) ||
        SKIPPED_DIRECTORY_NAMES.has(name)
      ) {
        state.skipped.push(relativePath);
      } else {
        walk(root, relativePath, state, files);
      }
    } else if (info.isFile()) {
      files.push({ relativePath, absolutePath, size: info.size });

      if (files.length > MAX_FILES) {
        throw new ScanFailure("file count limit exceeded");
      }
    } else {
      state.special.push(relativePath);
    }
  }
}

function scanText(text, relativePath, rules, privateTokenPatterns, add, contentContext) {
  for (const rule of rules.content) {
    add(rule.id, relativePath, countMatches(rule.pattern, text, rule.exceptions));
  }

  if (rules.domainRuleId !== undefined) {
    const raw = countForeignDomains(text, rules.allowedDomains);
    let actionable = raw;

    if (contentContext !== null && relativePath === LOCKFILE_PATH) {
      const review = reviewLockfileDomains(text, rules.allowedDomains, raw);

      if (review.verified) {
        actionable = review.actionable;

        for (const [host, count] of review.exempt) {
          contentContext.exempt(relativePath, host, count);
        }
      } else {
        add("LOCKFILE_UNVERIFIED", relativePath, 1);
      }
    }

    if (contentContext !== null) {
      contentContext.domainStats.raw += raw;
      contentContext.domainStats.actionable += actionable;
    }

    add(rules.domainRuleId, relativePath, actionable);
  }

  if (
    rules.diacriticRuleId !== undefined &&
    !DIACRITIC_EXEMPT_PATTERNS.some((pattern) => pattern.test(relativePath))
  ) {
    add(rules.diacriticRuleId, relativePath, countMatches(DIACRITIC_PATTERN, text));
  }

  for (const pattern of privateTokenPatterns ?? []) {
    add(rules.privateTokenRuleId ?? "PRIVATE_TOKEN", relativePath, countMatches(pattern, text));
  }
}

function reviewLockfileDomains(text, allowedDomains, rawCount) {
  let document;

  try {
    document = JSON.parse(text);
  } catch {
    return { verified: false };
  }

  let structuralTotal = 0;
  let actionable = 0;
  const exempt = new Map();

  const visitString = (value, jsonPath) => {
    const approvedHost = isFundingUrlPath(jsonPath) ? approvedFundingHost(value) : undefined;

    for (const match of value.matchAll(DOMAIN_CANDIDATE_PATTERN)) {
      const domain = match[0].toLowerCase();

      if (allowedDomains.has(domain)) {
        continue;
      }

      structuralTotal += 1;

      if (approvedHost !== undefined && domain === approvedHost) {
        exempt.set(approvedHost, (exempt.get(approvedHost) ?? 0) + 1);
      } else {
        actionable += 1;
      }
    }
  };

  const visit = (value, jsonPath) => {
    if (typeof value === "string") {
      visitString(value, jsonPath);
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, [...jsonPath, index]));
    } else if (value !== null && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        visitString(key, [...jsonPath, { key }]);
        visit(child, [...jsonPath, key]);
      }
    }
  };

  visit(document, []);

  // Fail closed: when the parsed document does not account for exactly the matches found in the
  // raw text (for example duplicate keys or escaped characters), no exemption is applied.
  if (structuralTotal !== rawCount) {
    return { verified: false };
  }

  return { verified: true, actionable, exempt };
}

function isFundingUrlPath(jsonPath) {
  if (
    jsonPath.length < 3 ||
    jsonPath[0] !== "packages" ||
    typeof jsonPath[1] !== "string" ||
    jsonPath[2] !== "funding"
  ) {
    return false;
  }

  if (jsonPath.length === 3) {
    return true;
  }

  if (jsonPath.length === 4) {
    return jsonPath[3] === "url" || typeof jsonPath[3] === "number";
  }

  return jsonPath.length === 5 && typeof jsonPath[3] === "number" && jsonPath[4] === "url";
}

function approvedFundingHost(value) {
  let url;

  try {
    url = new URL(value);
  } catch {
    return undefined;
  }

  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.port !== "") {
    return undefined;
  }

  const host = url.hostname.toLowerCase();
  return LOCKFILE_FUNDING_HOSTS.has(host) ? host : undefined;
}

function countMatches(pattern, text, exceptions = []) {
  let count = 0;

  for (const match of text.matchAll(pattern)) {
    const value = match[0];

    if (value.length === 0) {
      continue;
    }

    const excepted = exceptions.some((exception) =>
      exception.exact !== undefined ? value === exception.exact : value.startsWith(exception.prefix)
    );

    if (!excepted) {
      count += 1;
    }
  }

  return count;
}

function countForeignDomains(text, allowedDomains) {
  let count = 0;

  for (const match of text.matchAll(DOMAIN_CANDIDATE_PATTERN)) {
    if (!allowedDomains.has(match[0].toLowerCase())) {
      count += 1;
    }
  }

  return count;
}

function checkMetadata(root, rules, add) {
  if (rules.metadata.length === 0) {
    return [];
  }

  const manifestPath = path.join(root, "package.json");

  if (!existsWithoutFollowing(manifestPath)) {
    return rules.metadata.map((rule) => rule.id);
  }

  let manifest;

  try {
    manifest = JSON.parse(readBoundedText(manifestPath, MAX_FILE_BYTES, "package manifest"));
  } catch {
    add("PACKAGE_MANIFEST_INVALID", "package.json", 1);
    return [];
  }

  for (const rule of rules.metadata) {
    const actual = rule.key
      .split(".")
      .reduce(
        (value, key) => (value !== null && typeof value === "object" ? value[key] : undefined),
        manifest
      );

    if (actual !== rule.expected) {
      add(rule.id, "package.json", 1);
    }
  }

  return [];
}

function printResult(result, rules, privateTokensSupplied) {
  const lines = [
    `leak-scan: scanned ${result.filesScanned} files, ${result.bytesScanned} bytes`,
    `leak-scan: rules loaded: ${rules.content.length} content, ${rules.paths.length} path, ` +
      `${rules.metadata.length} metadata, ${rules.manual.length} manual-review`,
    `leak-scan: built-in checks: domains=${rules.domainRuleId ?? "off"}, ` +
      `diacritics=${rules.diacriticRuleId ?? "off"}, binary=${rules.binaryRuleId ?? "BINARY_FILE"}, ` +
      `large-file-storage=${rules.lfsRuleId ?? "off"}`
  ];

  for (const directory of result.skipped) {
    lines.push(`SKIPPED_DIRECTORY ${directory}`);
  }

  for (const id of [...rules.manual].sort(compareRuleIds)) {
    lines.push(`MANUAL_REVIEW ${id}`);
  }

  if (rules.privateTokenRuleId !== undefined && !privateTokensSupplied) {
    lines.push(`NOT_RUN ${rules.privateTokenRuleId} (no private token file supplied)`);
  }

  for (const id of result.notApplicable) {
    lines.push(`NOT_APPLICABLE ${id} (package manifest absent)`);
  }

  if (rules.domainRuleId !== undefined) {
    let exemptTotal = 0;

    for (const exemption of result.domainExemptions) {
      exemptTotal += exemption.count;
      lines.push(
        `EXEMPT ${rules.domainRuleId} ${exemption.relativePath} host=${exemption.host} ` +
          `count=${exemption.count} reason=lockfile-funding-metadata`
      );
    }

    lines.push(
      `leak-scan: ${rules.domainRuleId} raw=${result.domainStats.raw} exempt=${exemptTotal} ` +
        `actionable=${result.domainStats.actionable}`
    );
  }

  for (const finding of result.findings) {
    lines.push(`FINDING ${finding.id} ${finding.relativePath} count=${finding.count}`);
  }

  lines.push(
    `leak-scan: result ${result.findings.length === 0 ? "CLEAN" : "FINDINGS"} ` +
      `(${result.findings.length} finding entries)`
  );
  process.stdout.write(`${lines.join("\n")}\n`);
}

function globToRegExp(glob) {
  let source = "";

  for (let index = 0; index < glob.length; index += 1) {
    const character = glob[index];

    if (character === "*") {
      if (glob[index + 1] === "*") {
        if (glob[index + 2] === "/") {
          source += "(?:.*/)?";
          index += 2;
        } else {
          source += ".*";
          index += 1;
        }
      } else {
        source += "[^/]*";
      }
    } else {
      source += escapeRegExp(character);
    }
  }

  return new RegExp(glob.includes("/") ? `^${source}$` : `(?:^|/)${source}$`);
}

function splitComment(text) {
  const marker = /\s+#\s/.exec(text);

  return marker === null
    ? [text.trim(), ""]
    : [text.slice(0, marker.index).trim(), text.slice(marker.index + marker[0].length).trim()];
}

function stripComment(text) {
  return splitComment(text)[0];
}

function decodeText(bytes) {
  if (bytes.includes(0)) {
    return undefined;
  }

  const body = hasByteOrderMark(bytes) ? bytes.subarray(3) : bytes;

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    return undefined;
  }
}

function hasByteOrderMark(bytes) {
  return bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
}

function existsWithoutFollowing(target) {
  try {
    lstatSync(target);
    return true;
  } catch {
    return false;
  }
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compareRuleIds(left, right) {
  return stableCompare(ruleSortKey(left), ruleSortKey(right));
}

function ruleSortKey(id) {
  const match = /^([A-Z])(\d+)$/.exec(id);
  return match === null ? `~${id}` : `${match[1]}${match[2].padStart(4, "0")}`;
}

function stableCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function malformed(lineNumber, message) {
  return new ScanFailure(
    lineNumber > 0
      ? `malformed rules file at line ${lineNumber}: ${message}`
      : `malformed rules file: ${message}`
  );
}

function fail(message) {
  process.stderr.write(`leak-scan: error: ${message}\n`);
  return 2;
}

function messageOf(error) {
  if (error instanceof ScanFailure) {
    return error.message;
  }

  const code =
    error !== null && typeof error === "object" && "code" in error ? String(error.code) : "";
  return `unexpected failure${code === "" ? "" : ` (${code})`}`;
}
