import path from "node:path";
import { createHash } from "node:crypto";
import { readBoundedTextFile } from "./bounded-file-reader.js";
import { canonicalDirectory } from "./local-file-path.js";
import type { LocalReadPolicy } from "./local-read-policy.js";
import type { CancellationSignal } from "../core/knowledge-pack/knowledge-pack-source.js";
import { parseLocatedJson } from "../core/architecture-sources/json-with-locations.js";
import { createEnterpriseSnapshot, EnterpriseError, enterpriseLimits, validateEnterpriseCatalog, type EnterpriseCatalog, type EnterpriseEvidence } from "../core/enterprise/enterprise-catalog.js";

export interface EnterpriseSourceConfig { readonly kind:"enterprise-json"; readonly path:string }
/** One bounded, link-free read. JSON pointers and physical lines refer to these exact bytes. */
export async function loadEnterpriseJson(source:EnterpriseSourceConfig, signal?:CancellationSignal, localReadPolicy?:LocalReadPolicy) {
  if(!source || Object.keys(source).sort().join(",") !== "kind,path" || source.kind !== "enterprise-json" ||
    typeof source.path !== "string" || !path.isAbsolute(source.path)) throw new EnterpriseError("invalid-source");
  const deadline = Date.now() + 10_000, readSignal = {get aborted(){return !!signal?.aborted || Date.now() >= deadline;}};
  const check = () => {if(signal?.aborted) throw new EnterpriseError("cancelled");if(Date.now() >= deadline) throw new EnterpriseError("deadline-exceeded");};
  check();
  const root = await canonicalDirectory(path.dirname(source.path)), file = path.basename(source.path);
  const input = await readBoundedTextFile(root,file,{maxBytes:enterpriseLimits.bytes,signal:readSignal,...(localReadPolicy?{localReadPolicy}:{})});
  check();
  const parsed = parseLocatedJson(input.text,file);
  let catalog:EnterpriseCatalog;
  try {catalog=validateEnterpriseCatalog(parsed.value);}
  catch(e) {
    if(e instanceof EnterpriseError) throw new EnterpriseError(e.code,e.issues.map(i=>{
      // Missing fields have no token. Locate their nearest existing parent instead of inventing line 1.
      const existing:(string|number)[]=[];let current:unknown=parsed.value;
      for(const part of i.path){
        if(!current||typeof current!=="object"||!Object.hasOwn(current,part))break;
        existing.push(part);current=(current as Record<string|number,unknown>)[part];
      }
      return {...i,location:parsed.at(existing)};
    }),e.count);
    throw e;
  }
  const evidence:EnterpriseEvidence = {file, sourceBytesSha256:createHash("sha256").update(input.text,"utf8").digest("hex"),
    capabilities:Object.fromEntries(catalog.capabilities.map((c,i)=>[c.id,{pointer:`/capabilities/${i}`,
      fields:Object.fromEntries(["id","name","description",...(c.parentId?["parentId"]:[]),...Object.keys(c.ratings??{}).map(s=>`ratings/${s}`)]
        .map(f=>[`/${f}`,parsed.at(["capabilities",i,...f.split("/")])]))}])),
    scales:Object.fromEntries(catalog.scales.map((s,i)=>[s.id,{pointer:`/scales/${i}`,location:parsed.at(["scales",i])}]))};
  check();
  return createEnterpriseSnapshot(catalog,evidence);
}
