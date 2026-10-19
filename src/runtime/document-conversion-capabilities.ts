import path from"node:path";
import{readFile,lstat}from"node:fs/promises";
import{createHash}from"node:crypto";
import{relativeSegments}from"../node/local-file-path.js";
import{createLocalReadPolicy,assertLocalReadPath}from"../node/local-read-policy.js";
export type DocumentConversionCapabilities=
 |{profile:"core";ocr:"not-installed";languages:readonly []}
 |{profile:"full";ocr:"not-validated"|"available";languages:readonly ["pl","en"]}
 |{profile:"full";ocr:"installation-error";code:string}
 |{profile:"unknown";ocr:"installation-error";code:"installation-invalid"};
export const ocrRequiredResources=["convert.mjs","ocr-parent.mjs","ocr-child.mjs","TRIAL_NOTICES.md","licenses/SKIA-LICENSE","assets/lang/LICENSE-tessdata-fast","assets/lang/pol.traineddata","assets/lang/eng.traineddata",
 "node_modules/pdfjs-dist/legacy/build/pdf.mjs","node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs","node_modules/tesseract.js/src/worker-script/node/index.js","node_modules/tesseract.js-core/tesseract-core-simd.wasm",
 ...["darwin-arm64","darwin-x64","linux-x64-gnu","linux-arm64-gnu","linux-x64-musl","linux-arm64-musl","win32-x64-msvc","win32-arm64-msvc"].map(p=>`node_modules/@napi-rs/canvas-${p}/skia.${p}.node`),
 "node_modules/@napi-rs/canvas-win32-x64-msvc/icudtl.dat","node_modules/@napi-rs/canvas-win32-arm64-msvc/icudtl.dat"] as const;
export function distributionDirectory():string{return typeof __dirname==="string"?path.dirname(__dirname):path.resolve("/nonexistent-archi-agent-distribution");}
/** Reads only the profile and inventory at activation. Modules/models remain unloaded. No cache. */
export async function getDocumentConversionCapabilities(options:{distributionDirectory?:string;validateOcr?:boolean;signal?:AbortSignal}={}):Promise<DocumentConversionCapabilities>{
 const root=options.distributionDirectory??distributionDirectory();let full=false;
 try{
  const profileFile=path.join(root,"distribution-profile.json");const policy=await createLocalReadPolicy([root]);await assertLocalReadPath(profileFile,policy);
  const pStat=await lstat(profileFile);if(!pStat.isFile()||pStat.size>4096)throw Error();
  const p=JSON.parse(await readFile(profileFile,"utf8"));
  if(p.schemaVersion!==1||!["core","full"].includes(p.profile)||Object.keys(p).sort().join(",")!=="ocr,profile,schemaVersion"||!p.ocr||typeof p.ocr!=="object")throw Error();
  full=p.profile==="full";
  if(!full){if(p.ocr.required!==false||Object.keys(p.ocr).join(",")!=="required")throw Error();return{profile:"core",ocr:"not-installed",languages:[]};}
  if(p.ocr.required!==true||!/^([a-f0-9]{64})$/.test(p.ocr.manifestSha256)||Object.keys(p.ocr).sort().join(",")!=="manifestSha256,required")throw Error();
  const manifestFile=path.join(root,"ux2-ocr/resource-manifest.json");await assertLocalReadPath(manifestFile,policy);
  const stat=await lstat(manifestFile);if(!stat.isFile()||stat.size>1024*1024)throw Error();
  const bytes=await readFile(manifestFile);if(createHash("sha256").update(bytes).digest("hex")!==p.ocr.manifestSha256)throw Error();
  const m=JSON.parse(bytes.toString("utf8"));if(m.schema!==2||!Array.isArray(m.files)||m.files.length>2000)throw Error();
  const files=m.files as {path:string;bytes:number;sha256:string}[];
  const seen=new Set<string>();for(const f of files){if(typeof f.path!=="string"||seen.has(f.path)||!Number.isSafeInteger(f.bytes)||f.bytes<0||!/^([a-f0-9]{64})$/.test(f.sha256))throw Error();relativeSegments(f.path);seen.add(f.path);}
  // Native filenames are platform-specific; require the pinned package for every platform.
  for(const required of ocrRequiredResources){if(required.endsWith(".node")? !files.some(f=>f.path.startsWith(required.slice(0,required.lastIndexOf("/")+1))&&f.path.endsWith(".node")&&f.bytes>0):!files.some(f=>f.path===required&&f.bytes>0))throw Error();}
  for(const f of files){
   if(options.signal?.aborted)throw Error();
   const absolute=path.join(root,"ux2-ocr",f.path);await assertLocalReadPath(absolute,policy);
   const before=await lstat(absolute,{bigint:true});if(!before.isFile()||before.size!==BigInt(f.bytes))throw Error();
   if(options.validateOcr){const data=await readFile(absolute);if(createHash("sha256").update(data).digest("hex")!==f.sha256)throw Error();}
   const after=await lstat(absolute,{bigint:true});if(before.dev!==after.dev||before.ino!==after.ino||before.size!==after.size||before.mtimeNs!==after.mtimeNs||before.ctimeNs!==after.ctimeNs)throw Error();
  }
  return{profile:"full",ocr:options.validateOcr?"available":"not-validated",languages:["pl","en"]};
 }catch{return full?{profile:"full",ocr:"installation-error",code:"ocr-installation-invalid"}:{profile:"unknown",ocr:"installation-error",code:"installation-invalid"};}
}
