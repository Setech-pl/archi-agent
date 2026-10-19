import type {ContextPlan} from "../pipeline/c4-context-plan.js";
import type {ContextSnapshot} from "../pipeline/c4-snapshot.js";
import {c4ElementLabel,c4Text} from "./c4-label.js";
export function renderContextPlan(plan:ContextPlan,snapshot:ContextSnapshot) {
  if(plan.snapshotDigest!==snapshot.digest||plan.systemId!==snapshot.systemId)throw new Error("c4-snapshot-mismatch");
  const aliases=new Map(snapshot.elements.map((e,i)=>[e.id,`e${i+1}`]));
  const subject=snapshot.elements.find(e=>e.id===snapshot.systemId)!;
  const lines=["@startuml", `title C4 System Context: ${c4Text(subject.name)}`];
  for(const e of snapshot.elements)lines.push(`rectangle "${c4ElementLabel(e,e.id!==snapshot.systemId,false)}" as ${aliases.get(e.id)} ${e.id===snapshot.systemId?"#B9D6F2":e.kind==="person"?"#D5E8D4":"#E7E6E6"}`);
  const positions=new Map<string,number>();
  for(const r of snapshot.relationships){lines.push(`${aliases.get(r.fromId)} --> ${aliases.get(r.toId)} : ${c4Text(r.purpose)}`);positions.set(r.factId,lines.length);}
  lines.push("legend right","Blue: selected software system","Green: person; grey: system outside the selected scope","Arrow: directed relationship declared by the source","endlegend","@enduml");return {plantUml:lines.join("\n")+"\n",lines:positions};
}
