const base=require('./src1-smoke-fixture.cjs');
exports.prepare=base.prepare;
exports.legend=['legend right','Legend','Actor symbol: grounded actor from the Knowledge Pack','Box, database or queue symbol: grounded system from the Knowledge Pack','[NEW] prefix: confirmed new participant, not part of the Knowledge Pack','Solid arrow with filled head: synchronous interaction','Arrow with open head: asynchronous interaction','Dashed arrow: response to a synchronous request','endlegend'].join('\n');
exports.diagram=(body='A -> B : read (DB)',name='Banking Database')=>`@startuml\nparticipant "Banking API" as A\ndatabase "${name}" as B\n${body}\n${exports.legend}\n@enduml\n`;
exports.prose='Banking API synchronicznie wywołuje Bazę Płatności.';
exports.answer=input=>{
 if(input.text){const text=input.text,name='Bazę Płatności',start=text.indexOf(name),ev={start:0,end:text.length};return {version:1,participants:[{id:'p1',mention:'Banking API',evidence:{start:0,end:11}},{id:'p2',mention:name,evidence:{start,end:start+name.length}}],steps:[{id:'s1',from:'p1',to:'p2',label:'wywołuje',async:false,isResponse:false,responseTo:null,interfaceType:null,interfaceName:null,evidence:ev,attributeEvidence:[{field:'async',evidence:ev},{field:'isResponse',evidence:ev}],blockPath:[]}],unexamined:[]};}
 const s=input.snapshot;
 if(s?.domain?.startsWith('archi-agent-c4-')) {
  if(input.plantUml)return {accepted:true,violations:[]};
  return s.domain==='archi-agent-c4-context/1'?{version:1,systemId:s.systemId,elementIds:s.elements.map(e=>e.id),relationshipIds:s.relationships.map(r=>r.factId)}:{version:1,parentId:s.systemId,containerIds:s.containerIds,externalIds:s.externalIds,relationshipIds:s.relationships.map(r=>r.factId)};
 }
 return base.answer(input);
};
