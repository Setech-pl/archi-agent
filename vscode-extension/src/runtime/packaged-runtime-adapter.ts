import { assertProfileAvailable, withProfileCancellation, withProfileSignal } from "../profile-availability.js";
import { createArchiAgentRuntime, type ArchiAgentRuntime } from "../../../src/runtime/index.js";

/**
 * The only place where the extension touches the application runtime implementation.
 *
 * In the source tree this imports the runtime entry directly. In the packaged extension the build
 * rewrites that import to the sibling bundle dist/archi-agent-runtime.js, which carries the core,
 * the Node adapters and their single dependency. The extension therefore never spawns a process,
 * never runs an npm script and never resolves anything in the source repository.
 */
export function createPackagedRuntime(extensionVersion?: string): ArchiAgentRuntime {
  const runtime=createArchiAgentRuntime({ extensionVersion });
  return new Proxy(runtime,{get(target,key){
    const value=Reflect.get(target,key);
    if(typeof value!=="function")return value;
    return (...args: any[])=>{
      assertProfileAvailable();
      if(["generateDiagram","generateSequenceDiagram","startFlowVerification"].includes(String(key)))args[0]={...args[0],signal:withProfileCancellation(args[0]?.signal)};
      if(key==="extractDocumentCandidates")args[0]={...args[0],signal:withProfileSignal(args[0]?.signal)};
      return value.apply(target,args);
    };
  }});
}
