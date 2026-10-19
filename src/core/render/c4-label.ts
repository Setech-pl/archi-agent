import {displayTextProblem} from "./plantuml-escape.js";
import type {C4Element,C4Relationship} from "../pipeline/c4-snapshot.js";
export function c4Text(text:string):string {
  if(displayTextProblem(text,{maxChars:1000})!==undefined)throw new Error("c4-unsafe-label");
  return text.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll("\\","\\\\").replaceAll('"',"&quot;");
}
function wrapped(text:string):string {const words=c4Text(text).split(" "),lines:string[]=[];let line="";for(const w of words){if(line.length+w.length>52&&line){lines.push(line);line="";}line+=(line?" ":"")+w;}if(line)lines.push(line);return lines.join("\\n");}
export function c4ElementLabel(e:C4Element,external=false,technology=true):string {return `${wrapped(e.name)}\\n[${e.kind==="person"?"Person":e.kind==="container"?"Container":`${external?"External ":""}Software System`}${technology&&e.technology?`: ${c4Text(e.technology)}`:""}]${e.description?`\\n\\n${wrapped(e.description)}`:""}`;}
export function c4RelationLabel(r:C4Relationship):string {return `${c4Text(r.purpose)}\\n[${r.interfaceType}${r.interfaceName?`: ${c4Text(r.interfaceName)}`:""}; ${r.mode}]`;}
