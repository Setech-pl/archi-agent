import { workbenchHtml } from "./webview.js";
export function configurationHtml(): string {
  return workbenchHtml("Archi Agent — Configuration", `
<div class="tabs" role="tablist" aria-label="Configuration sections">
<button id="knowledge-tab" role="tab" aria-controls="knowledge" aria-selected="true">Knowledge Management</button>
<button id="provider-tab" role="tab" aria-controls="provider" aria-selected="false" tabindex="-1">LLM Provider</button></div>
<p id="notice" role="status" aria-live="polite"></p>
<section id="knowledge" role="tabpanel" aria-labelledby="knowledge-tab">
<label for="project">Project / workspace</label><select id="project"></select>
<p id="scope"></p><p id="knowledge-error" class="error" role="alert"></p><div class="card"><h2>Active Knowledge Pack</h2><pre id="pack-path"></pre><p id="validation" role="status"></p><pre id="counts"></pre></div>
<div class="actions"><button id="choose">Choose Existing Knowledge Pack</button><button id="create">Create Knowledge Pack</button><button id="build">Build Knowledge Pack from Documents</button><button id="browse">Browse Knowledge</button><button id="refresh">Validate / Refresh</button></div>
<p class="muted">Choose validates before activation. Create starts with one real system. Document builds always save a new pack; review never changes an existing pack.</p>
<div id="files" class="actions"></div></section>
<section id="provider" role="tabpanel" aria-labelledby="provider-tab" hidden>
<p>Profile and model: User settings on this machine. Endpoint and timeout: User settings; an effective workspace override is shown below.</p>
<div class="grid"><div><label for="profile">Provider profile</label><select id="profile"></select>
<p id="profile-description"></p><label id="endpoint-label" for="endpoint">Endpoint</label><input id="endpoint" autocomplete="off"><p id="endpoint-help" class="muted"></p>
<label for="timeout">Request timeout (seconds)</label><input id="timeout" type="number" min="1" max="600">
<label for="model">Selected model</label><input id="model" list="models" autocomplete="off"><datalist id="models"></datalist>
<p class="muted">Choose a listed model or enter its exact identifier. No model is selected automatically.</p>
<div class="actions"><button id="apply">Apply</button><button id="discard">Discard Changes</button></div><p id="dirty" role="status"></p><p id="form-error" class="error" role="alert"></p></div>
<div><h2>Effective configuration</h2><pre id="effective"></pre><p id="key-state"></p>
<div class="actions"><button id="set-key">Set / Replace Key</button><button id="delete-key">Remove Key</button></div>
<p class="muted">Keys are entered in a native masked input and kept in SecretStorage.</p>
<button id="models-refresh">Refresh Models</button><button id="diagnose">Check Provider Configuration</button>
<p id="progress" role="status" aria-live="polite"></p><pre id="diagnostic"></pre>
<p class="muted">Check uses applied settings and at most one model-list request. Listing does not prove generation readiness, billing or quota. To test generation, explicitly use Create Diagram with a flow.</p></div></div></section>
`, String.raw`
const api=acquireVsCodeApi(), $=id=>document.getElementById(id);let state, draft, baseRevision, dirty=false, applyPending=false, activeTab=api.getState()?.tab||'knowledge';
const form=()=>({profile:$('profile').value,endpoint:$('endpoint').value,timeout:Number($('timeout').value),model:$('model').value});
const send=(op,extra={})=>api.postMessage({op,revision:state?.revision??0,...extra});
function tab(name,focus=false){activeTab=name;for(const n of ['knowledge','provider']){const b=$(n+'-tab');b.setAttribute('aria-selected',String(n===name));b.tabIndex=n===name?0:-1;$(n).hidden=n!==name;}if(focus)$(name+'-tab').focus();api.setState({tab:name,draft,baseRevision,dirty});}
for(const n of ['knowledge','provider']){$(n+'-tab').onclick=()=>tab(n);$(n+'-tab').onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();tab(e.key==='Home'?'knowledge':e.key==='End'?'provider':n==='knowledge'?'provider':'knowledge',true);}};}
function inputs(v){$('profile').value=v.profile;$('endpoint').value=v.endpoint;$('timeout').value=v.timeout;$('model').value=v.model;profileFields();}
function profileFields(){const p=$('profile').value;const fixed={'local-ollama':'http://127.0.0.1:11434/v1','cloud-anthropic':'https://api.anthropic.com','cloud-openai':'https://api.openai.com','cloud-openrouter':'https://openrouter.ai/api/v1'};$('endpoint').disabled=p!=='local-lm-studio';$('endpoint').hidden=p!=='local-lm-studio';$('endpoint-label').hidden=p!=='local-lm-studio';$('endpoint-help').textContent=fixed[p]?'Fixed profile endpoint: '+fixed[p]:'LM Studio: literal loopback URL only.';const profile=state?.profiles?.find(x=>x.profileId===p);$('profile-description').textContent=profile?profile.displayName+' — selected in this form. Apply saves this profile.':'';const needs=profile?.credentialRequirement==='api-key';$('key-state').textContent=(profile?.displayName||p)+': '+(needs?'API key '+(state?.profileKeys?.[p]?'present':'missing'):'No API key required.');$('set-key').textContent='Set / Replace Key for '+(profile?.displayName||p);$('delete-key').textContent='Remove Key for '+(profile?.displayName||p);}
function edits(profileChanged=false){if(profileChanged){$('model').value='';$('models').replaceChildren();}draft=form();dirty=JSON.stringify(draft)!==JSON.stringify(state.form);$('dirty').textContent=dirty?'Unapplied changes — Apply before listing or checking.':'All changes applied.';$('diagnostic').textContent='';controls();send('draft-changed',{dirty});tab(activeTab);}
for(const id of ['profile','endpoint','timeout','model'])$(id).addEventListener('input',()=>{profileFields();edits(id==='profile');});
function controls(){const locked=applyPending||!!state?.busy,applying=applyPending||state?.busy==='Applying settings…';for(const id of ['profile','timeout','model'])$(id).disabled=applying;$('endpoint').disabled=applying||$('profile').value!=='local-lm-studio';for(const id of ['choose','create','build','browse'])$(id).disabled=locked||!state?.projectSelected;for(const id of ['apply','discard'])$(id).disabled=locked||!dirty;for(const id of ['diagnose','models-refresh'])$(id).disabled=locked||dirty;const needsKey=state?.profiles?.find(p=>p.profileId===$('profile').value)?.credentialRequirement==='api-key';for(const id of ['set-key','delete-key'])$(id).disabled=locked||!needsKey;$('project').disabled=locked;$('refresh').disabled=locked;}
$('apply').onclick=()=>{if(applyPending)return;applyPending=true;controls();$('progress').textContent='Applying settings…';send('apply',{form:form(),baseRevision});};$('discard').onclick=()=>{draft=state.form;baseRevision=state.revision;dirty=false;inputs(draft);$('dirty').textContent='Changes discarded.';$('form-error').textContent='';controls();send('discard');tab(activeTab);};
$('project').onchange=()=>send('project',{project:$('project').value});
for(const [id,op] of [['choose','choose'],['create','create'],['build','build'],['refresh','refresh'],['browse','browse'],['set-key','set-key'],['delete-key','delete-key'],['models-refresh','models'],['diagnose','diagnose']])$(id).onclick=()=>send(op,op.includes('key')?{profile:$('profile').value}:{});
window.addEventListener('message',({data:m})=>{if(m.type==='tab'){tab(m.tab);return;}if(m.type==='apply-finished'){applyPending=false;controls();return;}if(m.type!=='state')return;const old=state;state=m;
$('notice').textContent=m.notice||'';$('form-error').textContent=m.error||'';$('knowledge-error').textContent=m.error||'';$('progress').textContent=m.busy||'';
$('project').replaceChildren();for(const p of m.projects){const o=document.createElement('option');o.value=p.id;o.textContent=p.label;$('project').append(o);}$('project').value=m.project;
$('scope').textContent=m.scope;$('pack-path').textContent=m.packPath||'No active Knowledge Pack.';$('validation').textContent=m.validation;$('counts').textContent=m.counts?Object.entries(m.counts).map(([k,v])=>k+': '+v).join(' · '):'';
$('files').replaceChildren();for(const file of m.files){const b=document.createElement('button');b.textContent='Open '+file;b.disabled=!!m.busy;b.onclick=()=>send('open-file',{file});$('files').append(b);}
$('profile').replaceChildren();for(const p of m.profiles){const o=document.createElement('option');o.value=p.profileId;o.textContent=p.displayName;$('profile').append(o);}
if(!old){const saved=api.getState();dirty=!!saved?.dirty;draft=dirty?saved.draft:m.form;baseRevision=dirty?saved.baseRevision:m.revision;}
if(m.applied||!dirty){draft=m.form;baseRevision=m.revision;dirty=false;}inputs(draft);$('dirty').textContent=dirty?'Unapplied changes. If settings changed externally, Discard and re-enter before Apply.':'All changes applied.';
$('effective').textContent=(dirty?'Applied configuration — unchanged until successful Apply.\n':'Applied configuration.\n')+m.effective;profileFields();
$('models').replaceChildren();for(const model of m.models){const o=document.createElement('option');o.value=model;$('models').append(o);}$('diagnostic').textContent=m.diagnostic||'';controls();tab(activeTab);});
tab(activeTab);send('ready');
`);
}
