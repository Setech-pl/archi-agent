import { validatePlantUmlDocument } from "../validation/plantuml-document-validator.js";
import { displayTextProblem } from "../render/plantuml-escape.js";
import { isSafeAlias } from "../render/alias-allocator.js";
import { knownLegendBlocks } from "../render/legend.js";
import { freezeVerification, type InputSpan, type InterpretedFlow, type InterpretationResult, type SyntaxIssue } from "./flow-interpretation.js";
const declaration=/^(actor|participant|database|queue)\s+(?:"([^"\n]+)"\s+as\s+([A-Za-z][A-Za-z0-9_]*)|([A-Za-z][A-Za-z0-9_]*)(?:\s+as\s+([A-Za-z][A-Za-z0-9_]*))?)$/;
const message=/^([A-Za-z][A-Za-z0-9_]*)\s*(->>|-->|->|<<-|<--|<-)\s*([A-Za-z][A-Za-z0-9_]*)\s*:\s*(.+)$/;
const interfaceLabel=/\s+\((REST API|SOAP|EVENT|FILE|DB|INTERNAL)(?:: ([^()]+))?\)$/;

/** Bounded text reader, never a PlantUML engine or preprocessor. */
export function parseSequenceVerification(text:string):InterpretationResult {
  const normalized=text.replace(/\r\n/g,"\n"),boundary=validatePlantUmlDocument(normalized);
  if(boundary.length) return {ok:false,code:"invalid-input",issues:boundary.map(i=>({code:i.rule}))};
  const rawLines=text.split(/\r?\n/),lines=rawLines.map(l=>l.trim());
  const offsets:number[]=[];let at=0;
  for(const l of rawLines) {offsets.push(at);at+=l.length+(text.slice(at+l.length,at+l.length+2)==="\r\n"?2:1);}
  const spanOf=(i:number):InputSpan=>({start:offsets[i]!,end:offsets[i]!+rawLines[i]!.length});
  const v:InterpretedFlow={version:1,participants:[],steps:[],unexamined:[]},issues:SyntaxIssue[]=[];
  const aliases=new Map<string,string>(),lower=new Set<string>();
  const legends=knownLegendBlocks();let notation=false;
  const legendRanges=new Set<number>();
  for(let i=1;i<lines.length;i++) if(lines[i]==="legend right") {
    const end=lines.indexOf("endlegend",i+1);
    if(end<0) return {ok:false,code:"invalid-input",issues:[{code:"unbalanced-block",span:spanOf(i)}]};
    if(legends.some(b=>b.join("\n")===lines.slice(i,end+1).join("\n"))) notation=true;
    else {v.unexamined.push({span:{start:spanOf(i).start,end:spanOf(end).end},reason:"syntax-not-covered"});issues.push({code:"syntax-not-covered",span:spanOf(i)});}
    for(let j=i;j<=end;j++) legendRanges.add(j);i=end;
  }
  const blocks:{kind:string;id:string;branch:number;messageCount:number;start:number;unsupported:boolean}[]=[];
  let body=false,blockId=0;
  const gap=(i:number)=>{if(issues.length<100) issues.push({code:"syntax-not-covered",span:spanOf(i)});if(v.unexamined.length<100)v.unexamined.push({span:spanOf(i),reason:"syntax-not-covered"});};
  for(let i=1;i<lines.length;i++) {
    const line=lines[i]!;
    if(!line||line==="@enduml"||line.startsWith("'")||legendRanges.has(i)) continue;
    const unsupported=blocks.some(b=>b.unsupported);
    const open=/^(alt|opt|loop|group|par|break|critical|ref)(?:\s+(.+))?$/.exec(line);
    if(open) {
      if(blocks.length>=4) return {ok:false,code:"input-limit",issues:[{code:"fragment-too-deep",span:spanOf(i)}]};
      const supported=["alt","opt","loop","group"].includes(open[1]!)&&!!open[2]&&displayTextProblem(open[2],{maxChars:1000})===undefined;
      blocks.push({kind:open[1]!,id:`b${++blockId}`,branch:0,messageCount:0,start:i,unsupported:unsupported||!supported});body=true;
      if(!supported||unsupported)gap(i);continue;
    }
    if(/^else(?:\s|$)/.test(line)) {
      const b=blocks.at(-1);if(!b||b.kind!=="alt"||!b.messageCount||!/^else\s+.+/.test(line)) return {ok:false,code:"invalid-input",issues:[{code:"unbalanced-block",span:spanOf(i)}]};
      b.branch++;b.messageCount=0;if(unsupported)gap(i);continue;
    }
    if(line==="end") {
      const b=blocks.pop();if(!b||!b.unsupported&&!b.messageCount)return {ok:false,code:"invalid-input",issues:[{code:"unbalanced-block",span:spanOf(i)}]};
      if(b.unsupported)gap(i);continue;
    }
    if(unsupported){gap(i);continue;}
    const d=declaration.exec(line);
    if(d) {
      const label=d[2]??d[4]!,alias=d[3]??d[5]??d[4]!;
      if(body||!isSafeAlias(alias)||lower.has(alias.toLowerCase())||displayTextProblem(label)!==undefined)
        return {ok:false,code:"invalid-input",issues:[{code:"invalid-declaration",span:spanOf(i)}]};
      const id=`p${v.participants.length+1}`,start=offsets[i]!+rawLines[i]!.indexOf(label);
      v.participants.push({id,mention:label,evidence:{start,end:start+label.length}});aliases.set(alias,id);lower.add(alias.toLowerCase());continue;
    }
    const m=message.exec(line);
    if(!m){
      // Unknown block starters cannot be treated as isolated lines with trustworthy contents.
      if(/^(?:note|box|legend|title|header|footer)\b/.test(line))return {ok:false,code:"unsupported",issues:[{code:"syntax-not-covered",span:spanOf(i)}]};
      gap(i);continue;
    }
    body=true;blocks.forEach(b=>b.messageCount++);
    const a=aliases.get(m[1]!),b=aliases.get(m[3]!);
    if(!a||!b||displayTextProblem(m[4],{maxChars:1000})!==undefined)return {ok:false,code:"invalid-input",issues:[{code:"undeclared-or-unsafe-endpoint",span:spanOf(i)}]};
    const left=m[2]!.startsWith("<"),from=left?b:a,to=left?a:b,arrow=m[2]!;
    const ev=spanOf(i),blockPath=blocks.map(b=>`${b.id}-${b.branch}`);
    const async=notation?(arrow==="->>"||arrow==="<<-"):null;
    const dashed=arrow==="-->"||arrow==="<--";
    const ann=notation?interfaceLabel.exec(m[4]!):null;
    const type=ann?.[1]==="REST API"?"REST_API":ann?.[1];
    const top=notation&&dashed?[...v.steps].reverse().find(s=>s.async===false&&s.isResponse===false&&JSON.stringify(s.blockPath)===JSON.stringify(blockPath)&&!v.steps.some(r=>r.responseTo===s.id)):undefined;
    const request=top&&top.from===to&&top.to===from&&(!type||!top.interfaceType||type===top.interfaceType)&&(!ann?.[2]||!top.interfaceName||ann[2]===top.interfaceName)?top:undefined;
    v.steps.push({id:`s${v.steps.length+1}`,from,to,label:m[4]!,async,isResponse:notation?(dashed?request?true:null:false):null,
      responseTo:request?.id??null,interfaceType:(type??null) as InterpretedFlow["steps"][number]["interfaceType"],interfaceName:ann?.[2]??null,
      evidence:ev,attributeEvidence:notation?[
        {field:"async",evidence:ev},...(!dashed||request?[{field:"isResponse" as const,evidence:ev}]:[]),
        ...(ann?[{field:"interfaceType" as const,evidence:ev}]:[]),...(ann?.[2]?[{field:"interfaceName" as const,evidence:ev}]:[])]:[],blockPath});
    if(v.participants.length>64||v.steps.length>256)return {ok:false,code:"input-limit",issues:[]};
  }
  if(blocks.length)return {ok:false,code:"invalid-input",issues:[{code:"unbalanced-block"}]};
  if(!v.steps.length)return {ok:false,code:"unsupported",issues};
  return {ok:true,value:freezeVerification(v),issues:freezeVerification(issues)};
}
