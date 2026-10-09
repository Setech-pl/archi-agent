import { randomBytes } from "node:crypto";

/** All user/source text is assigned with textContent/value by the local scripts. */
export function workbenchHtml(title: string, body: string, script: string): string {
  const nonce = randomBytes(24).toString("base64");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<style nonce="${nonce}">
body{font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);color:var(--vscode-foreground);background:var(--vscode-editor-background);padding:20px;max-width:1100px;margin:auto;overflow-wrap:anywhere}
h1{font-size:1.6em} h2{font-size:1.25em} p{line-height:1.5} label{display:block;margin:12px 0 5px}
input,select,textarea{box-sizing:border-box;width:100%;padding:7px;color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border,var(--vscode-contrastBorder,transparent));font:inherit}
button{font:inherit;padding:7px 12px;cursor:pointer;color:var(--vscode-button-foreground);background:var(--vscode-button-background);border:1px solid var(--vscode-contrastBorder,transparent);margin:4px 4px 4px 0}
button:hover{background:var(--vscode-button-hoverBackground)} button:disabled{opacity:.55;cursor:default}
:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:2px} [hidden]{display:none!important}
.tabs{display:flex;flex-wrap:wrap;border-bottom:1px solid var(--vscode-panel-border)} [aria-selected=true]{outline:2px solid var(--vscode-focusBorder)}
.card{border:1px solid var(--vscode-panel-border,var(--vscode-contrastBorder));padding:12px;margin:12px 0}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr));gap:16px}
pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit} .error{color:var(--vscode-errorForeground)} .muted{color:var(--vscode-descriptionForeground)}
#previews pre{max-height:320px;overflow:auto;border:1px solid var(--vscode-panel-border,var(--vscode-contrastBorder));padding:8px} input[type=checkbox]{width:auto} details{margin:8px 0} summary{cursor:pointer} .actions{display:flex;flex-wrap:wrap;gap:4px}
</style></head><body><h1>${title}</h1>${body}<script nonce="${nonce}">${script}</script></body></html>`;
}

export function plainMessage(value: unknown, allowed: readonly string[]): value is Record<string, unknown> & { op: string; revision: number } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.op !== "string" || !allowed.includes(v.op) || !Number.isSafeInteger(v.revision)) return false;
  const payloadFields: Record<string, readonly string[]> = {
    "set-key": ["profile"], "delete-key": ["profile"], apply: ["form", "baseRevision"], project: ["project"], "draft-changed": ["dirty"],
    "open-file": ["file"], decide: ["indices", "decision"], edit: ["index", "changes"]
  };
  const fields = ["op", "revision", ...(payloadFields[v.op] ?? [])];
  if (Object.keys(v).some((key) => !fields.includes(key))) return false;
  try { return JSON.stringify(value).length <= 128_000; } catch { return false; }
}
