import type {HostResultV1}from"../../runtime/index.js";
export function resultExitCode(result:HostResultV1):number{
  const o=result.outcome;
  if("code"in o&&o.code==="timeout"||result.operation==="diagram.generate"&&result.outcome.status==="failed"&&result.outcome.issues.some(i=>i.code==="timeout"))return 124;
  if(result.operation==="knowledge.inspect")return o.status==="success"?0:3;
  if(result.operation==="diagram.generate"){
    const d=result.outcome;if(d.status==="success")return 0;if(d.status==="unverified")return d.review.status==="rejected"?1:3;
    if(d.stage==="grounding-blocked"&&(d.ambiguities.length||d.unconfirmedNewParticipants.length||d.issues.some(i=>["c4-hierarchy-unavailable","c4-containers-unavailable"].includes(i.code))))return 2;
    return 3;
  }
  const v=result.outcome;if(v.status==="unsupported")return 2;if(v.status!=="completed"&&v.status!=="needs-resolution")return 3;
  const r=v.report.report;if(r.assessment==="discrepancies")return 1;
  return v.status==="completed"&&r.assessment==="conformant-within-scope"&&r.coverage.steps>0&&r.coverage.unresolved===0&&r.coverage.omitted===0&&!r.coverage.findingsTruncated&&r.coverage.conformant===r.coverage.steps?0:2;
}
export function isExecutionError(result:HostResultV1):boolean {
  if(result.operation==="flow.verify")return !["completed","needs-resolution","unsupported"].includes(result.outcome.status);
  if(result.operation==="diagram.generate")return result.outcome.status==="failed"?resultExitCode(result)!==2:result.outcome.status==="unverified"&&result.outcome.review.status==="failed";
  return result.outcome.status!=="success";
}
export function resultText(result:HostResultV1):string {
  if(result.operation==="flow.verify"&&(result.outcome.status==="completed"||result.outcome.status==="needs-resolution")){
    const r=result.outcome.report.report;
    return `${result.outcome.status}: ${r.assessment}\nScope: Sequence / prose; imported architecture projection\nCoverage: ${JSON.stringify(r.coverage)}\n${r.findings.map(f=>`${f.code}${f.inputSpan?` [${f.inputSpan.start},${f.inputSpan.end})`:""}`).join("\n")}\n`;
  }
  if(result.operation==="diagram.generate"&&result.outcome.status==="success")return `success\n${result.outcome.plantUml}\nReport (${result.outcome.reportFileName}):\n${result.outcome.groundingReport}\n`;
  return JSON.stringify(result,null,2)+"\n";
}
