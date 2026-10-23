import path from "node:path";
import * as vscode from "vscode";
import { createHash } from "node:crypto";
import type { EnterpriseMaterialInput } from "../../../src/runtime/index.js";

export interface CapturedEnterpriseInput { readonly whole:EnterpriseMaterialInput;readonly selection?:EnterpriseMaterialInput }
/** Exact local text and selection, before the first asynchronous interaction. */
export function captureEnterpriseInput():CapturedEnterpriseInput|undefined {
  const editor=vscode.window.activeTextEditor,tab=vscode.window.tabGroups?.activeTabGroup.activeTab;
  if(!editor||!["file","untitled"].includes(editor.document.uri.scheme)||tab&&(!(tab.input instanceof vscode.TabInputText)||tab.input.uri.toString()!==editor.document.uri.toString()))return;
  const doc=editor.document,text=doc.getText(),uri=doc.uri.toString(),sha=createHash("sha256").update(text,"utf8").digest("hex");
  const make=(content:string,startOffset:number,startLine:number,startColumn:number):EnterpriseMaterialInput=>({document:{kind:"editor-buffer",uri,type:"txt",content},
    origin:{label:path.basename(doc.fileName),uri,documentVersion:doc.version,documentSha256:sha,startOffset,startLine,startColumn,locations:"captured-document"}});
  const whole=make(text,0,1,1),selection=editor.selection;
  return Object.freeze({whole,...(selection&&!selection.isEmpty?{selection:make(doc.getText(selection),doc.offsetAt(selection.start),selection.start.line+1,selection.start.character+1)}:{})});
}
