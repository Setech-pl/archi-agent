import assert from 'node:assert/strict';
import {Cdp} from './ux3-real-ui-smoke.mjs';
/** Identify only the browser owning this isolated CDP port, never another desktop window. */
export async function nativePidForPort(port){
 const version=await(await fetch(`http://127.0.0.1:${port}/json/version`)).json(),socket=new WebSocket(version.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
 try{const result=await new Cdp(socket).send('SystemInfo.getProcessInfo'),pid=result.processInfo.find(p=>p.type==='browser')?.id;assert(Number.isSafeInteger(pid)&&pid>0);return pid;}
 finally{socket.close();}
}
