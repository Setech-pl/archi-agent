// Controlled transport for DEMO1 verification only. Never shipped as a model in the projects.
exports.answer = input => {
  if(input.plantUml)return input.snapshot?.domain?.startsWith('archi-agent-c4-')?{accepted:true,violations:[]}:{accepted:true,violations:[],confirmedUserStatedFactIds:[]};
  if(input.sources){
    const s=input.sources[0],pl=s.text.includes('Archiwum'),slices=s.evidenceSlices??[];
    const excerpt=slices[0]??{excerpt:s.text,startOffset:0,endOffset:s.text.length};
    const evidence=[{sourceId:s.sourceId,originalDigest:s.originalDigest,textDigest:s.textDigest,...excerpt}];
    return {version:1,candidates:[
      {table:'systems',row:{id:'planning',canonical_name:pl?'Planowanie misji':'Mission Planning',kind:'service',description:pl?'Usługa planowania misji':'Mission planning service'},basis:'explicit',reasoning:null,evidence},
      {table:'systems',row:{id:'archive',canonical_name:pl?'Archiwum':'Archive',kind:'database',description:pl?'Baza historii telemetrii':'Telemetry history database'},basis:'explicit',reasoning:null,evidence},
      {table:'relationships',row:{from_id:'planning',to_id:'archive',interface_type:'DB',interface_name:'',mode:'synchronous',purpose:pl?'Zapis planów misji':'Store mission plans'},basis:'explicit',reasoning:null,evidence}
    ]};
  }
  if(input.text){
    const text=input.text,retail=text.includes('Magazynem')||text.includes('Inventory'),pl=text.includes('synchronicznie');
    const from=retail?(pl?'Zamówienia':'Orders'):(pl?'Planowanie misji':'Mission Planning');
    const to=retail?(pl?'Magazynem':'Inventory'):(pl?'Komendami':'Command Service');
    const ev={start:0,end:text.trimEnd().length};
    return {version:1,participants:[from,to].map((mention,i)=>({id:'p'+(i+1),mention,evidence:{start:text.indexOf(mention),end:text.indexOf(mention)+mention.length}})),steps:[{id:'s1',from:'p1',to:'p2',label:pl?'Wywołanie':'Call',async:false,isResponse:false,responseTo:null,interfaceType:null,interfaceName:null,evidence:ev,attributeEvidence:[{field:'async',evidence:ev},{field:'isResponse',evidence:ev}],blockPath:[]}],unexamined:[]};
  }
  const s=input.snapshot;
  if(s?.domain?.startsWith('archi-agent-c4-'))return s.domain==='archi-agent-c4-context/1'?{version:1,systemId:s.systemId,elementIds:s.elements.map(e=>e.id),relationshipIds:s.relationships.map(r=>r.factId)}:{version:1,parentId:s.systemId,containerIds:s.containerIds,externalIds:s.externalIds,relationshipIds:s.relationships.map(r=>r.factId)};
  if(input.relationshipCatalog)return {version:1,elementIds:s.elements.map(e=>e.id),groundedDependencies:input.relationshipCatalog.map(r=>r.dependencyId),userStatedDependencies:[]};
  return {version:3,groundedSteps:input.operationCatalog.filter(o=>o.kind!=='response').map((o,i)=>({order:i+1,operationId:o.operationId,label:'Demo interaction '+(i+1)})),userStatedSteps:[]};
};
