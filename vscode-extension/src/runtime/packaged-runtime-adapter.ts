import { createArchiAgentRuntime, type ArchiAgentRuntime } from "../../../src/runtime/index.js";

/**
 * The only place where the extension touches the application runtime implementation.
 *
 * In the source tree this imports the runtime entry directly. In the packaged extension the build
 * rewrites that import to the sibling bundle dist/archi-agent-runtime.js, which carries the core,
 * the Node adapters and their single dependency. The extension therefore never spawns a process,
 * never runs an npm script and never resolves anything in the source repository.
 */
export function createPackagedRuntime(): ArchiAgentRuntime {
  return createArchiAgentRuntime();
}
