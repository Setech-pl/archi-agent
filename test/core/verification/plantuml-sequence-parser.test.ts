import {describe,it,expect} from "vitest";
import {parseSequenceVerification} from "../../../src/core/verification/plantuml-sequence-parser.js";
import {legendLines} from "../../../src/core/render/legend.js";
const diagram=(body:string,legend=true)=>`@startuml\nparticipant "Banking API" as A\ndatabase "Banking Database" as B\n${body}\n${legend?legendLines("en").join("\n")+"\n":""}@enduml\n`;
describe("VER1 bounded Sequence reader",()=>{
  it.each(["->","->>","-->","<-","<<-","<--"])("reads direction and convention for %s",arrow=>{
    const r=parseSequenceVerification(diagram(`A ${arrow} B : action`));expect(r.ok).toBe(true);if(!r.ok)return;
    expect(r.value.steps[0]!.from).toBe(arrow.startsWith("<")?"p2":"p1");
    expect(r.value.steps[0]!.async).toBe(arrow.includes(">>")||arrow.includes("<<"));
  });
  it("does not infer mode or response from arbitrary arrow styles",()=>{const r=parseSequenceVerification(diagram("A -> B : request",false));expect(r.ok).toBe(true);if(r.ok)expect(r.value.steps[0]).toMatchObject({async:null,isResponse:null});});
  it("pairs replies only with an unmatched synchronous request in the same branch",()=>{
    const r=parseSequenceVerification(diagram("A -> B : call (DB)\nB --> A : response (DB)"));expect(r.ok).toBe(true);if(r.ok)expect(r.value.steps[1]).toMatchObject({isResponse:true,responseTo:"s1"});
    const branch=parseSequenceVerification(diagram("alt x\nA -> B : call\nelse y\nB --> A : response\nend"));expect(branch.ok).toBe(true);if(branch.ok)expect(branch.value.steps[1]!.isResponse).toBe(null);
  });
  it("reports unknown lines and excludes unsupported blocks",()=>{const r=parseSequenceVerification(diagram("par x\nA -> B : ignored\nend\nA -> B : checked\nautonumber"));expect(r.ok).toBe(true);if(r.ok){expect(r.value.steps).toHaveLength(1);expect(r.value.unexamined).toHaveLength(4);}});
  it.each(["!include https://example.test/x","!define X A","skinparam x y"])("rejects unsafe %s",line=>expect(parseSequenceVerification(diagram(line)).ok).toBe(false));
  it("supports CRLF and retains raw evidence offsets",()=>{const text=diagram("  A -> B : call").replaceAll("\n","\r\n"),r=parseSequenceVerification(text);expect(r.ok).toBe(true);if(r.ok)expect(text.slice(r.value.participants[0]!.evidence.start,r.value.participants[0]!.evidence.end)).toBe("Banking API");});
  it.each(["C -> B : call","end","alt x\nA -> B : call","participant A\nA -> B : call"])("rejects invalid structure: %s",body=>expect(parseSequenceVerification(diagram(body)).ok).toBe(false));
});
