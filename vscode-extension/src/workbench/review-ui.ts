import { workbenchHtml } from "./webview.js";
export function reviewHtml(): string {
  return workbenchHtml("Archi Agent — Knowledge Pack Review", `
<p id="project"></p><p class="muted">Review the evidence before accepting. Technical validation does not establish semantic truth. All five files are additions in a new folder.</p>
<p id="notice" role="status" aria-live="polite"></p><p id="error" class="error" role="alert"></p>
<p id="summary" role="status"></p><pre id="issues"></pre>
<div class="actions"><button id="accept">Accept selected</button><button id="reject">Reject selected</button><button id="pending">Return selected to pending</button><button id="accept-all">Accept all pending</button><button id="reject-all">Reject remaining pending</button><button id="preview">Validate and preview</button><button id="cancel">Cancel</button></div>
<div id="candidates"></div><h2>Sources and conversion / OCR</h2><pre id="sources"></pre>
<h2>Five resulting files</h2><div id="previews"></div>
<button id="destination">Choose new pack folder</button><pre id="path"></pre><div class="actions"><button id="save">Save</button><button id="save-use">Save and use</button></div>
`, String.raw`
const api=acquireVsCodeApi(),$=id=>document.getElementById(id);let state;
const send=(op,extra={})=>api.postMessage({op,revision:state?.revision??0,...extra});
const selected=()=>Array.from(document.querySelectorAll('input[data-index]:checked')).map(e=>Number(e.dataset.index));
for(const [id,decision] of [['accept','accepted'],['reject','rejected'],['pending','pending']])$(id).onclick=()=>send('decide',{indices:selected(),decision});
$('accept-all').onclick=()=>send('decide',{indices:state.entries.flatMap((e,i)=>e.decision==='pending'?[i]:[]),decision:'accepted'});
$('reject-all').onclick=()=>send('decide',{indices:state.entries.flatMap((e,i)=>e.decision==='pending'?[i]:[]),decision:'rejected'});
for(const [id,op] of [['preview','preview'],['cancel','cancel'],['destination','destination'],['save','save'],['save-use','save-use']])$(id).onclick=()=>send(op);
window.addEventListener('message',({data:m})=>{if(m.type!=='state')return;state=m;$('project').textContent=m.project;$('notice').textContent=m.notice||m.busy||'';$('error').textContent=m.error||'';
const pending=m.entries.filter(e=>e.decision==='pending').length;$('summary').textContent=pending+' pending · '+m.entries.filter(e=>e.decision==='accepted').length+' accepted · '+m.entries.filter(e=>e.decision==='rejected').length+' rejected';
$('issues').textContent=m.issues.length?m.issues.map(i=>(i.entry===undefined?'':('Row '+(i.entry+1)+' · '))+(i.table||'')+(i.field?' · '+i.field:'')+' ['+i.code+'] '+i.message).join('\n'):'Validation passed. All dependencies are resolved.';
const checked=selected(),open=Array.from(document.querySelectorAll('details[data-row][open]')).map(d=>d.dataset.row);$('candidates').replaceChildren();m.entries.forEach((entry,index)=>{
const card=document.createElement('article');card.className='card';const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.dataset.index=index;check.checked=checked.includes(index);check.disabled=!!m.busy;label.append(check,document.createTextNode(' '+(index+1)+'. '+entry.candidate.table+' · '+entry.decision+' · '+entry.candidate.basis+(m.edited[index]?' · edited by user':'')));card.append(label);
const row=document.createElement('pre');row.textContent=Object.entries(entry.candidate.row).map(([k,v])=>k+': '+v).join('\n');card.append(row);
const evidence=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Evidence, references and original proposal';evidence.append(summary);const text=document.createElement('pre');text.textContent=JSON.stringify({evidence:entry.candidate.evidence,original:m.originals[index]},null,2);evidence.append(text);card.append(evidence);
const editor=document.createElement('details');editor.dataset.row=String(index);editor.open=open.includes(String(index));const editTitle=document.createElement('summary');editTitle.textContent='Edit proposed row';editor.append(editTitle);const fields={};for(const [field,value] of Object.entries(entry.candidate.row)){if(field==='id')continue;const l=document.createElement('label');l.textContent=field;l.htmlFor='row-'+index+'-'+field;const references=['from_id','to_id','target_id'].includes(field),input=document.createElement(references?'select':'input');input.id=l.htmlFor;
if(references){for(const e of m.entries.filter(e=>['systems','actors'].includes(e.candidate.table))){const o=document.createElement('option');o.value=e.candidate.row.id;o.textContent=e.candidate.row.canonical_name+' ('+e.decision+')';input.append(o);}}
input.value=value;input.disabled=!!m.busy;fields[field]=input;editor.append(l,input);}const apply=document.createElement('button');apply.textContent='Apply row edit';apply.disabled=!!m.busy;apply.onclick=()=>send('edit',{index,changes:Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,v.value]))});editor.append(apply);card.append(editor);$('candidates').append(card);});
$('sources').textContent=m.sources.map(s=>s.type.toUpperCase()+' · '+s.sourceId+'\nConversion: '+s.conversion.engine+' · OCR: '+s.conversion.ocrMode+'\n'+JSON.stringify(s.conversion.counts)+'\nPages: '+(s.conversion.pages.map(p=>p.page+': '+p.source).join(', ')||'not applicable')+'\nWarnings: '+(s.conversion.warnings.join('; ')||'none')+'\nCoverage: '+s.knowledgeCoverage+' · References: '+s.conversion.locations+'\nOriginal digest: '+s.originalDigest+'\nText digest: '+s.textDigest).join('\n\n');$('previews').replaceChildren();for(const doc of m.previews){const d=document.createElement('details'),s=document.createElement('summary'),p=document.createElement('pre');s.textContent=doc.file;p.textContent=doc.text;p.tabIndex=0;p.setAttribute('aria-label',doc.file+' preview');d.append(s,p);$('previews').append(d);}
$('path').textContent=m.directory||'No destination selected. Choose a new folder before saving.';
for(const id of ['accept','reject','pending','accept-all','reject-all','preview','destination'])$(id).disabled=!!m.busy||m.completed;
$('preview').disabled||=m.issues.length>0;for(const id of ['save','save-use'])$(id).disabled=!!m.busy||m.completed||!m.directory||m.previews.length!==5||m.issues.length>0;
$('cancel').textContent=m.completed?'Close':'Cancel';});send('ready');
`);
}
