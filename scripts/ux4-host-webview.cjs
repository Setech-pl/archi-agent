// Controlled message transport in a real Extension Host. This is not native UI evidence.
exports.controlWebviews = (vscode, onState) => {
  const original = vscode.window.createWebviewPanel, panels = [];
  vscode.window.createWebviewPanel = function (...args) {
    const actual = original.apply(this,args);
    let receive;
    const entry={actual,viewType:args[0],latest:undefined,send:async(op,extra={})=>receive({op,revision:entry.latest?.revision??0,...(op==='models'?{form:entry.latest?.form}:{}),...extra}),dispose:()=>actual.dispose()};
    panels.push(entry);
    const view = new Proxy(actual.webview,{get(target,key){
      if(key==='onDidReceiveMessage')return fn=>{receive=fn;queueMicrotask(()=>void entry.send('ready'));return {dispose(){}};};
      if(key==='postMessage')return async state=>{if(state.type==='state'){entry.latest=state;if(!state.busy&&onState)queueMicrotask(()=>void onState(entry,state));}return true;};
      const v=Reflect.get(target,key,target);return typeof v==='function'?v.bind(target):v;
    },set(target,key,value){return Reflect.set(target,key,value,target);}});
    return new Proxy(actual,{get(target,key){if(key==='webview')return view;const v=Reflect.get(target,key,target);return typeof v==='function'?v.bind(target):v;},set(target,key,value){return Reflect.set(target,key,value,target);}});
  };
  return {panels,restore:()=>{vscode.window.createWebviewPanel=original;panels.forEach(p=>p.dispose());}};
};
exports.wait = async (fn,label='host state')=>{const start=Date.now();while(Date.now()-start<15000){const r=fn();if(r)return r;await new Promise(r=>setTimeout(r,20));}throw new Error('timeout '+label);};
