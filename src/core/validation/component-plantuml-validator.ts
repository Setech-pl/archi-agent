import type { ResolvedComponentPlan } from "../pipeline/component-diagram-plan.js";
import { renderComponentPlan } from "../pipeline/component-diagram-plan.js";
import type { ComponentSnapshot } from "../pipeline/component-snapshot.js";
import type { PlantUmlStructureIssue } from "./plantuml-validator.js";
import { validatePlantUmlDocument } from "./plantuml-document-validator.js";

/** Closed D2 subset: only the exact declarations and dependency lines implied by the resolved plan. */
export function validateComponentSubset(text: string, plan: ResolvedComponentPlan, snapshot: ComponentSnapshot,
  factLines: ReadonlyMap<string, number>): readonly PlantUmlStructureIssue[] {
  const documentIssues = validatePlantUmlDocument(text);
  if (documentIssues.length) return documentIssues;
  if (!text.endsWith("\n")) return [{ rule: "missing-final-newline" }];
  let expected;
  try { expected = renderComponentPlan(plan, snapshot); }
  catch { return [{ rule: "unknown-statement" }]; }
  if (text !== expected.plantUml) return [{ rule: "unknown-statement" }];
  if (factLines.size !== plan.facts.length || plan.facts.some((fact) => factLines.get(fact.factId) !== expected.lines.get(fact.factId)))
    return [{ rule: "unknown-statement" }];
  return [];
}
