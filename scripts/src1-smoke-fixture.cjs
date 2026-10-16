const fs=require('node:fs'),path=require('node:path');
exports.prepare=(project,fixture)=>{
 const folder=path.join(project,'architecture');fs.cpSync(fixture,folder,{recursive:true});
 const flow=path.join(project,'banking-flow.md');fs.writeFileSync(flow,'---\ndiagram_name: banking\nflow_name: Banking\nauthor: SRC1\nlanguage: en\n---\nSPA calls Banking API. Banking API reads Banking Database.\n');
 return {flow,config:{kind:'structurizr-json',sourceId:'big-bank',modelPath:path.join(folder,'workspace.json'),overlayPath:path.join(folder,'overlay')}};
};
exports.answer=input=>{
 if(input.plantUml)return {accepted:true,violations:[],confirmedUserStatedFactIds:[]};
 if(input.relationshipCatalog)return {version:1,elementIds:input.snapshot.elements.map(e=>e.id),groundedDependencies:input.relationshipCatalog.map(r=>r.dependencyId),userStatedDependencies:[]};
 return {version:3,groundedSteps:[{order:1,operationId:input.operationCatalog.find(o=>o.kind==='request').operationId,label:'Call API'}],userStatedSteps:[]};
};
