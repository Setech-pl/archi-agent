export const diagramTypes = ["sequence", "component", "c4-context", "c4-container", "archimate-hld"] as const;
export type DiagramType = (typeof diagramTypes)[number];

export function isDiagramType(value: unknown): value is DiagramType {
  return typeof value === "string" && diagramTypes.includes(value as DiagramType);
}

export function isSupportedDiagramType(value: unknown): value is "sequence" {
  return value === "sequence";
}
