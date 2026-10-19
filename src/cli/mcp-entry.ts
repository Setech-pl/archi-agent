import path from "node:path";
import type {LocalHostConfig}from"../hosts/local/config.js";
/** Packaged as a sibling so CLI loads no MCP SDK until explicitly serving stdio. */
export async function serve(config:LocalHostConfig):Promise<void>{
  const module=await import(path.join(__dirname,"archi-agent-mcp.cjs")) as {serveMcp:(config:LocalHostConfig)=>Promise<void>};
  await module.serveMcp(config);
}
