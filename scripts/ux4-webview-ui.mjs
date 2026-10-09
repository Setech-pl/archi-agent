import assert from 'node:assert/strict';
import { waitFor } from './ux3-real-ui-smoke.mjs';
/** CDP evaluates only DOM selectors and operates visible controls, never the extension API. */
export class WebviewUi {
  constructor(cdp) {
    this.cdp=cdp;this.sessions=new Map();this.contexts=[];
    this.listener=e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.executionContextCreated')this.contexts.push({session:m.sessionId,id:m.params.context.id});};
    cdp.socket.addEventListener('message',this.listener);
  }
  async find(selector) {
    const {targetInfos}=await this.cdp.send('Target.getTargets');
    for(const t of targetInfos.filter(t=>t.type==='iframe'))if(!this.sessions.has(t.targetId)){
      const {sessionId}=await this.cdp.send('Target.attachToTarget',{targetId:t.targetId,flatten:true});this.sessions.set(t.targetId,sessionId);await this.cdp.send('Runtime.enable',{},sessionId);
    }
    for(const context of this.contexts){try{const r=await this.eval(`!!document.querySelector(${JSON.stringify(selector)})`,context);if(r)return context;}catch{}}
    return undefined;
  }
  async context(selector){return await waitFor(()=>this.find(selector),'webview '+selector,20000);}
  async eval(expression,context){const r=await this.cdp.send('Runtime.evaluate',{expression,contextId:context.id,returnByValue:true},context.session);if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result.value;}
  async read(selector,expression){return this.eval(expression,await this.context(selector));}
  async click(selector,root=selector){const ctx=await this.context(root);await this.eval(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:"center"})`,ctx);await waitFor(()=>this.eval(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});return e&&!e.disabled&&e.getBoundingClientRect().height>0})()`,ctx),'enabled '+selector);
    // DOM click dispatches the real button listener in the installed webview, without host/service calls.
    await this.eval(`document.querySelector(${JSON.stringify(selector)}).click()`,ctx);
  }
  async input(selector,value,root=selector){const ctx=await this.context(root);await this.eval(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.focus();e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));})()`,ctx);}
  async select(selector,value,root=selector){const ctx=await this.context(root);await this.eval(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`,ctx);}
  async wait(selector,expression){return waitFor(()=>this.read(selector,expression),'webview state '+selector,20000);}
  async focus(selector){await this.read(selector,`document.querySelector(${JSON.stringify(selector)}).focus()`);}
  async keyboard(key,code){await this.cdp.key(key,code);}
  async assertNoOverflow(selector){assert.equal(await this.read(selector,'document.documentElement.scrollWidth <= window.innerWidth + 2'),true);}
  dispose(){this.cdp.socket.removeEventListener('message',this.listener);}
}
