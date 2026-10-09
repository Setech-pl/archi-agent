import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { createArchiAgentRuntime, KnowledgePackReviewSession, inspectKnowledgePackDirectory } from "../../src/runtime/index.js";
import { selectKnowledgeContext } from "../../src/core/knowledge-pack/knowledge-snapshot.js";
import { documentEvidenceSlices, validateDocumentCandidates } from "../../src/core/knowledge-pack/builder/document-candidates.js";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const generator = { kind: "openai-compatible-local" as const, modelId: "synthetic", baseUrl:"http://127.0.0.1:1234/v1" };
describe("UX4-FU1 frozen input and located evidence", () => {
  it("supplies exact UTF-16 locations including OCR headings, CRLF/NFC and surrogate boundaries", async () => {
    const text = "## Page 1 (OCR)\n\nZażółć 😀 Alpha service.\n\n## Page 2 (blank)\n";
    const slices = documentEvidenceSlices(text);
    for (const s of slices) expect(text.slice(s.startOffset,s.endOffset)).toBe(s.excerpt);
    const excerpt = slices.find(s=>s.excerpt.includes("Alpha"))!;
    const source = { sourceId: "source-"+"a".repeat(64), originalDigest:sha(text), textDigest:sha(text), type:"pdf" as const, scope:"explicit-file" as const, knowledgeCoverage:"partial" as const, text,
      conversion:{engine:"local-converter" as const,ocrMode:"auto" as const,counts:{pages:2},pages:[{page:1,source:"ocr" as const},{page:2,source:"blank" as const}],warnings:["ocr-confidence-unavailable"],locations:"normalized-text-offsets" as const} };
    const bundle={version:1 as const,digest:"b".repeat(64),sources:[source]};
    const evidence={sourceId:source.sourceId,originalDigest:source.originalDigest,textDigest:source.textDigest,...excerpt};
    const value={version:1,candidates:[{table:"systems",row:{id:"alpha",canonical_name:"Alpha",kind:"service",description:"Service"},basis:"explicit",reasoning:null,evidence:[evidence]}]};
    expect((await validateDocumentCandidates(value,bundle,new AbortController().signal)).candidates[0]?.evidence[0]?.location.startLine).toBe(3);
    await expect(validateDocumentCandidates({...value,candidates:[{...value.candidates[0],evidence:[{...evidence,startOffset:0,endOffset:excerpt.excerpt.length}]}]},bundle,new AbortController().signal)).rejects.toMatchObject({code:"evidence-location-mismatch"});
    const long = documentEvidenceSlices("a".repeat(511)+"😀"+"b".repeat(10));
    expect(long.map(s=>s.excerpt).join("")).toBe("a".repeat(511)+"😀"+"b".repeat(10));
  });
  it.each(["file:///synthetic/dirty.md","untitled:Untitled-1"])("freezes %s without disk/temp provenance, persists original/text digests, and excludes URI from the model", async uri => {
    const input={kind:"editor-buffer" as const,uri,type:"md" as const,content:"\uFEFFAlpha service.\r\n"};
    const original=input.content;let wire:any;const stages:string[]=[];
    const runtime=createArchiAgentRuntime({diagramClientFactory:()=>({clientType:"synthetic",generationMetadata:{modelId:"synthetic",temperature:0,seed:42,attemptCount:1,structuredOutput:true},complete:async request=>{
      wire=JSON.parse(request.messages[1]!.content);const source=wire.sources[0],slice=source.evidenceSlices.find((e:any)=>e.excerpt.includes("Alpha"));
      return {source:"content",value:{version:1,candidates:[{table:"systems",row:{id:"alpha",canonical_name:"Alpha",kind:"service",description:"Service"},basis:"explicit",reasoning:null,evidence:[{sourceId:source.sourceId,originalDigest:source.originalDigest,textDigest:source.textDigest,...slice}]}]}};
    }})});
    const pending=runtime.extractDocumentCandidates!({documents:[input],generator,onStage:s=>stages.push(s)});input.content="Changed after extraction started.";
    const r=await pending;expect(r.status).toBe("success");if(r.status!=="success")return;
    const s=r.result.bundle.sources[0]!;expect(s).toMatchObject({scope:"editor-buffer",editorUri:uri,text:"Alpha service.\n",originalDigest:sha(original),textDigest:sha("Alpha service.\n")});
    expect(JSON.stringify(wire)).not.toContain(uri);expect(stages).toEqual(["read","provider-selection","generation","validation"]);
    const session=new KnowledgePackReviewSession(r.result);await session.decide([0],"accepted");const preview=await session.prepare();
    const root=await realpath(await mkdtemp(path.join(tmpdir(),"fu1-buffer-")));try{const directory=path.join(root,"pack");await session.save(preview,directory);const loaded=await inspectKnowledgePackDirectory(directory);expect(loaded.ok).toBe(true);if(loaded.ok){expect(loaded.pack.documentProvenance?.[0]?.sources[0]).toMatchObject({scope:"editor-buffer",editorUri:uri,originalDigest:sha(original)});expect(JSON.stringify(selectKnowledgeContext(loaded.snapshot,loaded.pack.systems.map(s=>s.id)))).not.toContain(uri);}}finally{await rm(root,{recursive:true,force:true});}
  });
  it("rejects unsupported identities and oversized frozen buffers before provider access",async()=>{
    const runtime=createArchiAgentRuntime();let calls=0;
    const config=async()=>{calls++;return generator;};
    for(const input of [{kind:"editor-buffer",uri:"https://example.invalid/a.md",type:"md",content:"Alpha"},{kind:"editor-buffer",uri:"untitled:1",type:"md",content:"x".repeat(10*1024*1024+1)}]){
      expect((await runtime.extractDocumentCandidates!({documents:[input as never],generator:config})).status).toBe("failed");
    }expect(calls).toBe(0);
  });
});
