import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync,realpathSync,mkdtempSync,cpSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {runHostSmoke} from './ux3-vscode-smoke.mjs';
const[vsix,cli,outArg]=process.argv.slice(2),out=path.resolve(outArg);mkdirSync(out,{recursive:true});
process.env.MCP1_CLI=path.resolve(cli);process.env.MCP1_NODE=process.execPath;const root=realpathSync(mkdtempSync(path.join(tmpdir(),'mcp1-export-')));cpSync('test/fixtures/structurizr/big-bank-plc',root,{recursive:true});process.env.SRC1_FIXTURE=root;
const results=await runHostSmoke(path.resolve(vsix),out,'mcp1-export-extension-host.cjs','export',['src1-smoke-fixture.cjs','ver1-c4-fixture.cjs']);
writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));assert(results.length&&results.every(r=>r.status==='PASS'));
