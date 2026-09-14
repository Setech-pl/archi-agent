import { ensurePumlExtension, normalizeDiagramName } from "./naming.js";

/**
 * Selects the next free artifact name for `diagramName`.
 *
 * Comparison is case-insensitive because the primary target platform has a
 * case-insensitive filesystem: treating `same.puml` and `Same.puml` as
 * different names would plan a path that silently replaces an existing file.
 */
export function nextVersionedFileName(diagramName: string, existingFileNames: string[]): string {
  const baseFileName = ensurePumlExtension(normalizeDiagramName(diagramName));
  const taken = new Set(
    existingFileNames.map((fileName) => fileName.toLocaleLowerCase())
  );

  if (!taken.has(baseFileName.toLocaleLowerCase())) {
    return baseFileName;
  }

  const stem = baseFileName.slice(0, -".puml".length);
  let version = 2;

  while (taken.has(`${stem}_v${version}.puml`.toLocaleLowerCase())) {
    version += 1;
  }

  return `${stem}_v${version}.puml`;
}
