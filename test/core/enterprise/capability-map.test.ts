import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {validateEnterpriseCatalog,createEnterpriseSnapshot,EnterpriseError,type EnterpriseCatalog} from "../../../src/core/enterprise/enterprise-catalog.js";
import {projectCapabilityMap,renderCapabilityMap,validateCapabilityMapRender,type CapabilityMapSelection} from "../../../src/core/enterprise/capability-map.js";
import {parseLocatedJson} from "../../../src/core/architecture-sources/json-with-locations.js";
const fixture=()=>JSON.parse(readFileSync("examples/retail-checkout/architecture/enterprise.json","utf8")) as EnterpriseCatalog;
const evidence={file:"enterprise.json",sourceBytesSha256:"a".repeat(64),capabilities:{},scales:{}};
const snapshot=(c=fixture())=>createEnterpriseSnapshot(validateEnterpriseCatalog(c),evidence);
const selection=(s:ReturnType<typeof snapshot>,overrides:Partial<CapabilityMapSelection>={}):CapabilityMapSelection=>({rootIds:[],maxLevel:3,colorBy:{kind:"rating",scaleId:"maturity"},language:"pl",expectedCatalogDigest:s.catalogDigest,...overrides});
const codes=(c:unknown)=>{try{validateEnterpriseCatalog(c);return [];}catch(e){expect(e).toBeInstanceOf(EnterpriseError);return (e as EnterpriseError).issues.map(i=>i.code);}};
describe("EA1 catalog and deterministic projection",()=>{
  it("freezes a genuine L1/L2/L3 business hierarchy; renders explicit zero, neutral missing and partial coverage",()=>{
    const s=snapshot(),p=projectCapabilityMap(s,selection(s)),r=renderCapabilityMap(p);
    expect(s.hierarchy.find(h=>h.id==="payment")).toMatchObject({level:3,rootId:"sales",parentId:"checkout"});
    expect(r.plantUml).toContain("partial");expect(r.plantUml).toContain("Brak danych");expect(r.plantUml).toContain("0 - Początkowa");
    expect(r.plantUml).toContain("płatności");expect(r.plantUml).toContain("\\n");expect(Object.keys(r.lines)).toHaveLength(11);
    expect(Object.isFrozen(s.catalog.capabilities[0])).toBe(true);expect(Object.isFrozen(p.selection.rootIds)).toBe(true);
    expect(r.plantUml).not.toMatch(/->|!include|https?:/);
  });
  it("is invariant to record, key, scale and provenance ordering, with stable IDs after rename",()=>{
    const c=fixture(),a=snapshot(c);c.capabilities.reverse();c.scales.reverse();c.capabilities.forEach(c=>{c.provenance.reverse();c.provenance.forEach(p=>p.fields.reverse());});
    const b=snapshot(c);expect(b.catalogDigest).toBe(a.catalogDigest);
    expect(renderCapabilityMap(projectCapabilityMap(b,selection(b)))).toEqual(renderCapabilityMap(projectCapabilityMap(a,selection(a))));
    c.capabilities.find(c=>c.id==="checkout")!.name="Zamknięcie zakupu";const renamed=snapshot(c);
    expect(renamed.catalogDigest).not.toBe(a.catalogDigest);expect(renamed.hierarchy).toEqual(a.hierarchy);
  });
  it.each(["name","description","parent","rating","coverage","provenance","scale"])("semantic digest includes %s",field=>{
    const c=fixture(),a=snapshot(c);const target=c.capabilities.find(c=>c.id==="checkout")!;
    if(field==="name")target.name="Zmiana";if(field==="description")target.description="Zmiana";
    if(field==="parent")target.parentId="customer";if(field==="rating")target.ratings!.maturity=0;
    if(field==="coverage")c.source.scope.coverage="complete";if(field==="provenance")target.provenance[0]!.recordId="original";
    if(field==="scale")c.scales[0]!.levels[0]!.label="Start";
    expect(snapshot(c).catalogDigest).not.toBe(a.catalogDigest);
  });
  it("separates full hierarchy, selected scope, detail omissions and missing ratings",()=>{
    const s=snapshot(),p=projectCapabilityMap(s,selection(s,{rootIds:["sales"],maxLevel:2}));
    expect(p.visible.map(h=>h.id)).toEqual(["checkout","returns","sales"]);
    expect(p.excluded.find(e=>e.id==="payment")?.reason).toBe("below-detail-level");
    expect(p.excluded.find(e=>e.id==="delivery")?.reason).toBe("outside-selected-scope");
    const neutral=projectCapabilityMap(s,selection(s,{colorBy:{kind:"none"}}));
    expect(renderCapabilityMap(neutral).plantUml).not.toContain("0 - Początkowa");expect(neutral.projectionDigest).not.toBe(p.projectionDigest);
    expect(projectCapabilityMap(s,selection(s,{language:"en"})).projectionDigest).not.toBe(projectCapabilityMap(s,selection(s)).projectionDigest);
  });
  it.each(["duplicate","missing-parent","self-parent","cycle","deep","bad-rating","unknown-scale","scale-order","scale-duplicate","provenance","reference-version","unknown-field","version","missing-name","empty-description","coverage"])("rejects %s without repair",kind=>{
    const c=fixture(),target=c.capabilities.find(c=>c.id==="checkout")!;
    if(kind==="duplicate")c.capabilities.push(c.capabilities[0]!);
    if(kind==="missing-parent")target.parentId="missing";
    if(kind==="self-parent")target.parentId=target.id;
    if(kind==="cycle")target.parentId="payment";
    if(kind==="deep")c.capabilities.find(c=>c.id==="returns")!.parentId="payment";
    if(kind==="bad-rating")target.ratings!.maturity=99;
    if(kind==="unknown-scale")target.ratings={unknown:1};
    if(kind==="scale-order")c.scales[0]!.levels.reverse();
    if(kind==="scale-duplicate")c.scales.push(c.scales[0]!);
    if(kind==="provenance")target.provenance[0]!.fields=["/name"];
    if(kind==="reference-version")delete (target.provenance[0]!.reference as Partial<{version:string}>).version;
    if(kind==="unknown-field")Object.assign(target,{system:true});if(kind==="version")Object.assign(c,{schemaVersion:2});
    if(kind==="missing-name")delete (target as Partial<typeof target>).name;if(kind==="empty-description")target.description="";
    if(kind==="coverage")c.source.scope.coverage="not-provided";
    expect(codes(c).length).toBeGreaterThan(0);
  });
  it.each(['!include secret','@enduml','<img:http://evil>','[[https://evil]]','**markup**','a" as B','a\\n!include','a\nb','x\u202ey',' name','e\u0301'])('rejects unsafe label %j',name=>{
    const c=fixture();c.capabilities[0]!.name=name;expect(codes(c).length).toBeGreaterThan(0);
  });
  it("allows duplicate names with stable IDs and an explicit warning; does not aggregate parent ratings",()=>{
    const c=fixture();c.capabilities[0]!.name=c.capabilities[1]!.name;const s=snapshot(c);expect(s.duplicateNames).toHaveLength(1);
    expect(s.catalog.capabilities.find(c=>c.id==="customer")!.ratings).toBeUndefined();
    const p=projectCapabilityMap(s,selection(s));const {plantUml,lines}=renderCapabilityMap(p);
    expect(plantUml.split("\n")[lines.customer!-1]).toContain("Brak danych");
  });
  it("rejects stale and invalid views; explicit absence and empty scope never produce a diagram",()=>{
    const s=snapshot();
    for(const v of [{rootIds:["checkout"]},{rootIds:["sales","sales"]},{expectedCatalogDigest:"0".repeat(64)},{colorBy:{kind:"rating",scaleId:"bad"} as const},{maxLevel:4 as 3}])
      expect(()=>projectCapabilityMap(s,selection(s,v))).toThrow();
    const c=fixture();c.capabilities=[];expect(()=>projectCapabilityMap(snapshot(c),selection(snapshot(c)))).toThrow("empty-scope");
    c.source.scope.coverage="not-provided";expect(()=>projectCapabilityMap(snapshot(c),selection(snapshot(c)))).toThrow("enterprise-data-unavailable");
  });
  it("enforces visible/root limits without truncation and permits conscious narrowing",()=>{
    const c=fixture(),base=c.capabilities[0]!;c.capabilities=Array.from({length:121},(_,i)=>({...structuredClone(base),id:`r-${String(i).padStart(4,"0")}`}));
    const s=snapshot(c);expect(()=>projectCapabilityMap(s,selection(s))).toThrow("map-too-large");
    expect(projectCapabilityMap(s,selection(s,{rootIds:["r-0000"]})).visible).toHaveLength(1);
    const d=fixture();d.capabilities=Array.from({length:120},(_,i)=>({...structuredClone(base),id:`c-${i}`,...(i?{parentId:"c-0"}:{}),provenance:[{sourceId:d.source.id,recordId:`c-${i}`,fields:["/name","/description",...(i?["/parentId"]:[]),"/ratings/maturity"]}]}));
    const valid=snapshot(d);expect(projectCapabilityMap(valid,selection(valid)).visible).toHaveLength(120);
    d.capabilities.push({...structuredClone(d.capabilities[1]!),id:"extra"});const tooBig=snapshot(d);expect(()=>projectCapabilityMap(tooBig,selection(tooBig))).toThrow("map-too-large");
    expect(projectCapabilityMap(tooBig,selection(tooBig,{maxLevel:1})).visible).toHaveLength(1);
  });
  it("enforces catalog/text boundaries, bounded diagnostics, JSON bytes, depth, token and duplicate-key limits",()=>{
    const c=fixture();c.capabilities[0]!.name="ą".repeat(160);c.capabilities[0]!.description="ą".repeat(2000);expect(codes(c)).toEqual([]);
    c.capabilities[0]!.name+="ą";expect(codes(c).length).toBeGreaterThan(0);
    c.capabilities=Array.from({length:1001},()=>c.capabilities[0]!);expect(codes(c).length).toBeGreaterThan(0);
    expect(()=>parseLocatedJson(" ".repeat(1024*1024-2)+"{}","enterprise.json")).not.toThrow();
    expect(()=>parseLocatedJson(" ".repeat(1024*1024-1)+"{}","enterprise.json")).toThrow("source-limit-exceeded");
    expect(()=>parseLocatedJson('{"a":1,"a":2}',"enterprise.json")).toThrow("source-key-duplicate");
    expect(()=>parseLocatedJson("[".repeat(65)+"0"+"]".repeat(65),"enterprise.json")).toThrow("source-limit-exceeded");
    expect(()=>parseLocatedJson("["+"0,".repeat(50001)+"0]","enterprise.json")).toThrow("source-limit-exceeded");
    c.capabilities=Array.from({length:1000},(_,i)=>({...fixture().capabilities[0]!,id:`id-${i}`}));expect(codes(c)).toEqual([]);
  });
  it("closed render validator rejects added statements, aliases and nesting corruption",()=>{
    const s=snapshot(),r=renderCapabilityMap(projectCapabilityMap(s,selection(s)));
    for(const changed of [r.plantUml.replace("legend\n","!include secret\nlegend\n"),r.plantUml.replace('as cap_0002','as cap_0001'),r.plantUml.replace("@enduml","url of cap_0001 is https://bad\n@enduml")])
      expect(()=>validateCapabilityMapRender(changed,11)).toThrow();
  });
  it("keeps reserved words in source and scale labels as literal legend content",()=>{
    const c=fixture();c.source.name="a".repeat(32)+" endlegend";c.source.scope.description="a".repeat(32)+" legend";c.scales[0]!.name="endlegend";
    const s=snapshot(c);expect(()=>renderCapabilityMap(projectCapabilityMap(s,selection(s)))).not.toThrow();
  });
});
