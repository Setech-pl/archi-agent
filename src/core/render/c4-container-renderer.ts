import type {ContainerPlan} from "../pipeline/c4-container-plan.js";
import type {ContainerSnapshot} from "../pipeline/c4-snapshot.js";
import {c4ElementLabel,c4RelationLabel,c4Text} from "./c4-label.js";
export function renderContainerPlan(plan:ContainerPlan,snapshot:ContainerSnapshot) {
  if(plan.snapshotDigest!==snapshot.digest||plan.parentId!==snapshot.systemId)throw new Error("c4-snapshot-mismatch");
  const aliases=new Map(snapshot.elements.map((e,i)=>[e.id,`e${i+1}`])),parent=snapshot.elements.find(e=>e.id===snapshot.systemId)!;
  const lines=["@startuml", `title C4 Container: ${c4Text(parent.name)}`];
  for(const e of snapshot.elements.filter(e=>plan.externalIds.includes(e.id)))lines.push(`rectangle "${c4ElementLabel(e,true)}" as ${aliases.get(e.id)} ${e.kind==="person"?"#D5E8D4":"#E7E6E6"}`);
  lines.push(`rectangle "${c4Text(parent.name)}\\n[Software System Boundary]" as system_boundary {`);
  for(const e of snapshot.elements.filter(e=>plan.containerIds.includes(e.id)))lines.push(`  rectangle "${c4ElementLabel(e)}" as ${aliases.get(e.id)} #B9D6F2`);
  lines.push("}");
  const positions=new Map<string,number>();
  for(const r of snapshot.relationships){lines.push(`${aliases.get(r.fromId)} --> ${aliases.get(r.toId)} : ${c4RelationLabel(r)}`);positions.set(r.factId,lines.length);}
  lines.push("legend right","Boundary: source software system; blue: its containers","Green: person; grey: external software system","Arrow: directed source relationship; bracket: overlay interface and model/overlay mode","Technology is shown only when supplied by the source","endlegend","@enduml");return {plantUml:lines.join("\n")+"\n",lines:positions};
}
