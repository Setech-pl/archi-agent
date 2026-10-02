'use strict';
// Test-only network tripwire, inherited by the conversion process and its Tesseract worker.
const blocked = () => { throw new Error('NETWORK_ATTEMPT_BLOCKED'); };
globalThis.fetch = blocked;
for (const name of ['node:net', 'node:http', 'node:https']) {
  const module = require(name);
  for (const method of ['connect', 'createConnection', 'request', 'get']) {
    if (typeof module[method] === 'function') module[method] = blocked;
  }
}
