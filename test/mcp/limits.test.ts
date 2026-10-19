import {it,expect} from 'vitest';
import {BoundedStdin} from '../../src/mcp/server.js';
it('accepts independent bounded frames across chunks and rejects a long unterminated frame before JSON parsing',async()=>{
 const ok=new BoundedStdin();ok.resume();ok.write(Buffer.alloc(1024*1024,32));ok.write(Buffer.from('\n'));ok.write(Buffer.alloc(1024*1024,32));ok.end(Buffer.from('\n'));
 await new Promise<void>((resolve,reject)=>{ok.on('end',resolve);ok.on('error',reject);});
 const bad=new BoundedStdin();bad.resume();const error=new Promise<Error>(resolve=>bad.once('error',resolve));bad.write(Buffer.alloc(1024*1024,32));bad.end(Buffer.from('x'));
 expect((await error).message).toBe('frame-too-large');
});
