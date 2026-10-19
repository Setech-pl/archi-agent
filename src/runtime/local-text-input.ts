import path from "node:path";
import { readBoundedTextFile } from "../node/bounded-file-reader.js";
import { assertLocalReadPath, type LocalReadPolicy } from "../node/local-read-policy.js";
import { relativeSegments } from "../node/local-file-path.js";
import type { CancellationSignal } from "./runtime-types.js";
import { parseLocatedJson } from "../core/architecture-sources/json-with-locations.js";
export async function readLocalTextInput(root:string,relativePath:string,options:{maxBytes:number;localReadPolicy:LocalReadPolicy;signal?:CancellationSignal}) {
  relativeSegments(relativePath);
  await assertLocalReadPath(path.join(root,relativePath),options.localReadPolicy);
  const value=await readBoundedTextFile(root,relativePath,options);
  return {text:value.text,fileName:path.basename(relativePath)};
}
export function parseLocalJson(text:string):unknown { return parseLocatedJson(text,"config.json").value; }
export async function resolveLocalReadReference(root:string,relativePath:string,localReadPolicy:LocalReadPolicy,allowMissing=false):Promise<string> {
  relativeSegments(relativePath);const absolute=path.join(root,relativePath);
  await assertLocalReadPath(absolute,localReadPolicy,{allowMissing});return absolute;
}
