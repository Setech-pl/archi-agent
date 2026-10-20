import {mkdtemp,writeFile,readFile,readdir,symlink,rm,realpath} from "node:fs/promises";
import {createHash} from "node:crypto";
import path from "node:path";
import {tmpdir} from "node:os";
import {afterEach,expect,it} from "vitest";
import {generateCapabilityMap,inspectEnterpriseSource,saveDiagramBundle,planDiagramBundle,isCompletedDiagramArtifact,createLocalReadPolicy} from "../../src/runtime/index.js";
const roots:string[]=[];
afterEach(async()=>{for(const r of roots.splice(0))await rm(r,{recursive:true,force:true});});
async function fixture(){const root=await realpath(await mkdtemp(path.join(tmpdir(),"ea1-test-")));roots.push(root);const text=await readFile("examples/retail-checkout/architecture/enterprise.json","utf8"),file=path.join(root,"enterprise.json");await writeFile(file,text);return {root,file,text,source:{kind:"enterprise-json" as const,path:file}};}
async function request(f:Awaited<ReturnType<typeof fixture>>){const i=await inspectEnterpriseSource(f.source);expect(i.status).toBe("success");if(i.status!=="success")throw Error(i.code);
 return {source:f.source,selection:{rootIds:[],maxLevel:3 as const,colorBy:{kind:"rating" as const,scaleId:"maturity"},language:"pl" as const,expectedCatalogDigest:i.snapshot.catalogDigest}};}
it("generates without any provider; captures truthful provenance, exact hashes and the original ART1 pair",async()=>{
 const f=await fixture(),req=await request(f),result=await generateCapabilityMap(req);expect(result.status).toBe("success");if(result.status!=="success")throw Error(JSON.stringify(result));
 if(result.report.formatVersion!==1)throw Error("local v1 report required");
 expect(result.report.modelCalls).toBe(0);expect(result.report.semanticReview.status).toBe("not-applicable");expect(isCompletedDiagramArtifact(result.artifact)).toBe(true);
 expect(result.report.source.sourceBytesSha256).toBe(createHash("sha256").update(f.text).digest("hex"));
 const item=result.report.visible.find(v=>v.capability.id==="checkout")!;
 expect(item.locator.pointer).toBe("/capabilities/1");expect(f.text.split("\n")[item.locator.fields['/parentId']!.line-1]).toContain('"parentId": "sales"');
 expect(result.plantUml.split("\n")[item.renderLine-1]).toContain("Finalizacja");
 await writeFile(f.file,"changed after generation");const saved=await saveDiagramBundle(f.root,result.artifact,planDiagramBundle());
 const puml=await readFile(path.join(saved.directory,"diagram.puml"),"utf8"),report=JSON.parse(await readFile(path.join(saved.directory,"report.json"),"utf8"));
 expect(puml).toBe(result.plantUml);expect(report.generationReport).toEqual(result.report);expect(report.diagram.sha256).toBe(createHash("sha256").update(puml).digest("hex"));
 expect(report.sourceReferences.enterpriseCatalog).toEqual({reference:"enterprise.json",availability:"project-relative"});expect(JSON.stringify(report)).not.toContain(f.root);
 expect(report.configuration.projection).not.toHaveProperty("modelId");expect(report).not.toHaveProperty("knowledge");
});
it("formatting changes fingerprint and actual locators, not semantics; data change after inspection is stale",async()=>{
 const f=await fixture(),req=await request(f),a=await generateCapabilityMap(req);expect(a.status).toBe("success");
 const data=JSON.parse(f.text);data.capabilities.reverse();await writeFile(f.file,JSON.stringify(data));const b=await generateCapabilityMap(req);expect(b.status).toBe("success");
 if(a.status!=="success"||b.status!=="success"||a.report.formatVersion!==1||b.report.formatVersion!==1)throw Error("generation failed");expect(b.plantUml).toBe(a.plantUml);expect(b.report.projectionDigest).toBe(a.report.projectionDigest);
 expect(b.report.source.sourceBytesSha256).not.toBe(a.report.source.sourceBytesSha256);expect(b.report.visible.find(v=>v.capability.id==="checkout")!.locator.fields['/name']!.line).toBe(1);
 data.capabilities[0].name="Changed";await writeFile(f.file,JSON.stringify(data));expect(await generateCapabilityMap(req)).toMatchObject({status:"failed",code:"stale-source"});
});
it("Cancel inspection/generation/save has no partial artifacts",async()=>{
 const f=await fixture(),req=await request(f);expect(await inspectEnterpriseSource(f.source,{aborted:true})).toMatchObject({status:"failed",code:"cancelled"});
 expect(await generateCapabilityMap(req,{aborted:true})).toMatchObject({status:"failed",code:"cancelled"});
 const result=await generateCapabilityMap(req);if(result.status!=="success")throw Error(result.code);
 await expect(saveDiagramBundle(f.root,result.artifact,planDiagramBundle(),{signal:AbortSignal.abort()})).rejects.toThrow();expect(await readdir(f.root)).toEqual(["enterprise.json"]);
});
it("rejects links, invalid UTF8, duplicate keys, oversized input and read-root escapes with safe issues",async()=>{
 const f=await fixture(),link=path.join(f.root,"link.json");await symlink(f.file,link);expect(await inspectEnterpriseSource({...f.source,path:link})).toMatchObject({status:"failed",code:"symbolic-link"});
 for(const [bytes,code] of [[Buffer.from([0xff]),"invalid-utf8"],[Buffer.from('{"a":1,"a":2}'),"source-key-duplicate"],[Buffer.alloc(1024*1024+1,32),"too-large"]] as const){await writeFile(f.file,bytes);expect(await inspectEnterpriseSource(f.source)).toMatchObject({status:"failed",code});}
 await writeFile(f.file,f.text);const other=await fixture(),policy=await createLocalReadPolicy([other.root]);expect(await inspectEnterpriseSource(f.source,undefined,policy)).toMatchObject({status:"failed",code:"containment-violation"});
 const data=JSON.parse(f.text);data.capabilities[0].name="!include secret";await writeFile(f.file,JSON.stringify(data,null,2));const invalid=await inspectEnterpriseSource(f.source);expect(invalid.status).toBe("failed");
 if(invalid.status==="failed"){expect(invalid.issues[0]).toMatchObject({code:"unsafe-label",path:["capabilities",0,"name"]});expect(JSON.stringify(invalid)).not.toContain(f.root);}
});
it("locates a missing field at the real parent record rather than fabricated line 1",async()=>{
 const f=await fixture(),c=JSON.parse(f.text);delete c.capabilities[1].name;const text=JSON.stringify(c,null,2);await writeFile(f.file,text);
 const result=await inspectEnterpriseSource(f.source);expect(result.status).toBe("failed");if(result.status!=="failed")throw Error("accepted missing name");
 const issue=result.issues.find(i=>i.path.join('/')==='capabilities/1/name')!;expect(issue).toBeDefined();expect(issue.location?.line).toBeGreaterThan(1);
 const line=issue.location!.line;expect(text.split('\n')[line-1]!.trim()).toBe('{');expect(text.split('\n')[line]!).toContain('"id": "checkout"');
});
