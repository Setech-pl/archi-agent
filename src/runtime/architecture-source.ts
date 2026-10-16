import path from "node:path";
import { composeStructurizrKnowledge } from "../core/architecture-sources/structurizr-json.js";
import { ArchitectureSourceError } from "../core/architecture-sources/json-with-locations.js";
import { overlayFiles, type OverlayTexts } from "../core/architecture-sources/knowledge-overlay.js";
import { NodeArchitectureFileSource } from "../node/node-architecture-file-source.js";
import { inspectKnowledgePackDirectory } from "./knowledge-pack-onboarding.js";
import { KnowledgePackError } from "../core/knowledge-pack/source-errors.js";
import { BoundedReadError } from "../node/bounded-file-reader.js";
import type { CancellationSignal } from "../core/knowledge-pack/knowledge-pack-source.js";
import type { KnowledgePackSourceConfig } from "./runtime-types.js";
export function validStructurizrConfiguration(v: unknown): v is Extract<KnowledgePackSourceConfig, {kind:"structurizr-json"}> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const c = v as Record<string,unknown>;
  return Object.keys(c).sort().join(",") === "kind,modelPath,overlayPath,sourceId" && c.kind === "structurizr-json" &&
    typeof c.sourceId === "string" && /^[a-z][a-z0-9-]{0,55}$/.test(c.sourceId) &&
    [c.modelPath,c.overlayPath].every(p => typeof p === "string" && path.isAbsolute(p) && !/[\x00-\x1f\x7f]/.test(p));
}
/** Same production loader for generation, configuration and Browser. No process-global cache. */
export async function inspectArchitectureSource(config: KnowledgePackSourceConfig, signal?: CancellationSignal) {
  if (config.kind === "local-directory") return inspectKnowledgePackDirectory(config.path);
  try {
    if (!validStructurizrConfiguration(config)) throw new ArchitectureSourceError("source-configuration-invalid");
    const model = await NodeArchitectureFileSource.open(path.dirname(config.modelPath), [path.basename(config.modelPath)]);
    const overlay = await NodeArchitectureFileSource.open(config.overlayPath, overlayFiles);
    const options = signal ? { signal } : {};
    const modelText = await model.readTextFile(path.basename(config.modelPath), options);
    const texts: Record<string,string> = {};
    for (const file of overlayFiles) texts[file] = await overlay.readTextFile(file, options);
    const result = composeStructurizrKnowledge(modelText, texts as unknown as OverlayTexts, config.sourceId);
    return { ok: true as const, pack: result.pack, snapshot: result.knowledge,
      counts: Object.fromEntries(["systems","actors","relationships","aliases","rules"].map(t => [t,result.pack[t as "systems"].length])) };
  } catch (error) {
    const code = error instanceof ArchitectureSourceError || error instanceof KnowledgePackError || error instanceof BoundedReadError ? error.code : "source-read-failed";
    const location = error instanceof ArchitectureSourceError ? error.location : undefined;
    return { ok: false as const, code, issues: [{ severity: "error" as const, code, message: "Architecture source rejected. Check the source and overlay.", ...(location ?? {}) }] };
  }
}
