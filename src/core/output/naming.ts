/**
 * Output naming rules.
 *
 * Paths are produced as POSIX-style relative strings, so the result is the
 * same on every platform. Resolving them against a real directory is the job
 * of an adapter outside the core layer.
 */

export const defaultOutputDirectory = "architecture-diagrams";
export const diagramFileExtension = ".puml";

const maxDiagramIdLength = 64;
const diagramIdPattern = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const reservedCharacterRun = /[<>:"/\\|?*]+/g;
const controlCharacterRun = /[\u0000-\u001f\u007f]+/g;
const unsafeCharacter = /[<>:"/\\|?*\u0000-\u001f\u007f]/;
const reservedDeviceNames = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  ...Array.from({ length: 9 }, (_, index) => `com${index + 1}`),
  ...Array.from({ length: 9 }, (_, index) => `lpt${index + 1}`)
]);

/**
 * Turns a free-form diagram name into a single filename-safe segment. Case is
 * preserved; separators, reserved characters, control characters and
 * parent-directory sequences can never survive.
 */
export function normalizeDiagramName(diagramName: string): string {
  const normalized = diagramName
    .trim()
    .replace(controlCharacterRun, "_")
    .replace(/\s+/g, "_")
    .replace(reservedCharacterRun, "_")
    .replace(/\.{2,}/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_.]+|[_.]+$/g, "");

  return avoidReservedDeviceName(normalized);
}

export function ensurePumlExtension(fileName: string): string {
  return fileName.toLowerCase().endsWith(diagramFileExtension)
    ? fileName
    : `${fileName}${diagramFileExtension}`;
}

/** Diagram identifiers consist of lower-case letters, digits and hyphens. */
export function isFilenameSafeDiagramId(value: string): boolean {
  return (
    typeof value === "string" &&
    value.length <= maxDiagramIdLength &&
    diagramIdPattern.test(value) &&
    !reservedDeviceNames.has(value)
  );
}

export function assertDiagramId(value: string): string {
  if (!isFilenameSafeDiagramId(value)) {
    throw new Error(
      `Diagram identifier must have 1 to ${maxDiagramIdLength} lower-case letters, digits or hyphens, ` +
        "start and end with a letter or digit, and must not be a reserved device name."
    );
  }

  return value;
}

/** Validates a relative output directory and returns it without trailing slashes. */
export function normalizeOutputDirectory(outputDirectory: string): string {
  const trimmed = outputDirectory.trim().replace(/\/+$/, "");

  if (trimmed.length === 0) {
    throw new Error("Output directory must not be blank.");
  }

  if (trimmed.includes("\\")) {
    throw new Error("Output directory must use forward slashes.");
  }

  if (trimmed.startsWith("/") || /^[A-Za-z]:/.test(trimmed)) {
    throw new Error("Output directory must be relative.");
  }

  const segments = trimmed.split("/");

  for (const segment of segments) {
    if (segment === "" || segment === "." || segment === "..") {
      throw new Error("Output directory must not contain empty, current or parent segments.");
    }

    if (unsafeCharacter.test(segment) || segment !== segment.trim()) {
      throw new Error("Output directory contains reserved characters.");
    }
  }

  return segments.join("/");
}

/** A diagram file name is one safe segment ending with the diagram extension. */
export function isSafeDiagramFileName(fileName: string): boolean {
  if (typeof fileName !== "string" || fileName.length === 0) {
    return false;
  }

  if (unsafeCharacter.test(fileName) || /\s/.test(fileName)) {
    return false;
  }

  if (fileName.startsWith(".") || fileName.includes("..")) {
    return false;
  }

  if (!fileName.toLowerCase().endsWith(diagramFileExtension)) {
    return false;
  }

  const stem = fileName.slice(0, -diagramFileExtension.length);
  const firstStemPart = stem.split(".")[0] ?? "";

  return stem.length > 0 && !reservedDeviceNames.has(firstStemPart.toLowerCase());
}

/** Builds `<outputDirectory>/<diagramId>/<fileName>` as a relative POSIX path. */
export function buildDiagramRelativePath(
  diagramId: string,
  fileName: string,
  outputDirectory: string = defaultOutputDirectory
): string {
  const directory = normalizeOutputDirectory(outputDirectory);
  assertDiagramId(diagramId);

  if (!isSafeDiagramFileName(fileName)) {
    throw new Error("Diagram file name must be a single safe segment ending with .puml.");
  }

  return `${directory}/${diagramId}/${fileName}`;
}

function avoidReservedDeviceName(value: string): string {
  const [stem = "", ...rest] = value.split(".");

  if (!reservedDeviceNames.has(stem.toLowerCase())) {
    return value;
  }

  return [`${stem}_diagram`, ...rest].join(".");
}
