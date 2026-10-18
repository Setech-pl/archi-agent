import {afterEach,it,expect,vi} from 'vitest';
import {extensions} from '../doubles/vscode-module-double.js';
afterEach(()=>vi.restoreAllMocks());
it('latches a newly enabled profile conflict and aborts an already running operation until reload',async()=>{
 let both=false;
 vi.spyOn(extensions,'getExtension').mockImplementation(id=>(id==='setech-pl.archi-agent'||both?{}:undefined)as never);
 const p=await import('../../vscode-extension/src/profile-availability.js');
 expect(p.profileConflict()).toBe(false);const signal=p.withProfileSignal();expect(signal.aborted).toBe(false);
 const lazy=p.withProfileCancellation();both=true;expect(lazy.aborted).toBe(true);expect(signal.aborted).toBe(true);expect(()=>p.assertProfileAvailable()).toThrow('profile-conflict');
 both=false;expect(p.profileConflict()).toBe(true);expect(signal.aborted).toBe(true);
});
