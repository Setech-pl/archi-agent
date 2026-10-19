import {describe,it,expect} from "vitest";
import {compareFlow} from "../../../src/core/verification/compare-flow.js";
import {parseSequenceVerification} from "../../../src/core/verification/plantuml-sequence-parser.js";
import {knowledgeSnapshotFromPack} from "../../../src/core/knowledge-pack/knowledge-snapshot.js";
import type {KnowledgePack,RelationshipRecord} from "../../../src/core/knowledge-pack/knowledge-pack.schema.js";
import {legendLines} from "../../../src/core/render/legend.js";
import {validateFlowInterpretation} from "../../../src/core/verification/flow-interpretation.js";
const location={file:"systems.md",line:2};
function check(body:string,relations:Partial<RelationshipRecord>[],require=false) {
 const pack:KnowledgePack={systems:[{id:"a",canonicalName:"A",kind:"system",description:"A",location},{id:"b",canonicalName:"B",kind:"system",description:"B",location}],actors:[],aliases:[],rules:require?[{rule:"require",fromId:"a",toId:"b",reason:"Required",location:{file:"rules.md",line:2}}]:[],relationships:relations.map((r,i)=>({fromId:"a",toId:"b",mode:"synchronous",interfaceType:"REST_API",interfaceName:undefined,purpose:"call",location:{file:"relationships.md",line:i+2},...r}))};
 const text=`@startuml\nparticipant A\nparticipant B\n${body}\n${legendLines("en").join("\n")}\n@enduml\n`,parsed=parseSequenceVerification(text);if(!parsed.ok)throw Error(parsed.code);
 return compareFlow({text,format:"plantuml-sequence",modelCalls:0,interpretation:parsed.value,syntaxIssues:parsed.issues,pack,snapshot:knowledgeSnapshotFromPack(pack),decisions:[]});
}
describe("VER1 independent-review regressions",()=>{
 it("rejects a second prose response to an already closed request",()=>{
   const text="A B",ev={start:0,end:3},attributes=[{field:"async",evidence:ev},{field:"isResponse",evidence:ev}];
   const make=(id:string,from:string,to:string,responseTo:string|null)=>({id,from,to,label:"step",async:false,isResponse:responseTo!==null,responseTo,interfaceType:null,interfaceName:null,evidence:ev,attributeEvidence:attributes,blockPath:[]});
   const raw={version:1,participants:[{id:"a",mention:"A",evidence:{start:0,end:1}},{id:"b",mention:"B",evidence:{start:2,end:3}}],steps:[make("s1","a","b",null),make("s2","b","a","s1"),make("s3","b","a","s1")],unexamined:[]};
   expect(validateFlowInterpretation(raw,text)).toMatchObject({ok:false,code:"interpretation-response-invalid"});
 });
 it("cannot claim conformity with a missing required interaction",()=>{const r=check("A -> A : local\nB -> B : local",[],true);expect(r.findings.map(f=>f.code)).toContain("required-interaction-not-shown");expect(r.assessment).toBe("inconclusive");});
 it("cannot confirm a response with a different explicit interface",()=>{const r=check("A -> B : call (REST API)\nB --> A : result (SOAP)",[{interfaceType:"REST_API"},{interfaceType:"SOAP"}]);expect(r.assessment).toBe("inconclusive");expect(r.steps[1]!.status).toBe("unresolved");});
 it("finds reverse interface even when another forward interface exists",()=>{const r=check("A -> B : call (SOAP)",[{interfaceType:"REST_API"},{fromId:"b",toId:"a",interfaceType:"SOAP"}]);expect(r.findings.map(f=>f.code)).toContain("direction-mismatch");});
 it("retains every source fact for parallel matching relationships",()=>{const r=check("A -> B : call",[{interfaceType:"REST_API"},{interfaceType:"SOAP"}]);expect(r.steps[0]!.factIds).toHaveLength(2);});
});
