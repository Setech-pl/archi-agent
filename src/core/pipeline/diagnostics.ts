/** A host may send these bounded JSON Lines to its existing output channel. */
export type DiagnosticSink = (line: string) => void;
type Field = string | number | boolean | readonly string[] | null;
export const diagnosticLineLimit = 1024;
const safeFieldKeys = new Set(["diagramType", "flowSourceKind", "profileId", "modelId", "generatorType",
  "digest", "participantCount", "relationshipCount", "ruleCount", "flowEvidenceCount", "requestCount",
  "responseCount", "asynchronousCount", "callNumber", "schemaVersion", "durationMs", "version",
  "groundedStepCount", "userStatedStepCount", "totalStepCount", "rule", "list", "order", "stepIndex", "operationId", "flowEvidenceId", "groundedCount",
  "userStatedCount", "messageCount", "lineCount", "line", "violationCount", "confirmationCount", "accepted", "verdict", "types",
  "status", "finalPhase", "code", "generatorCalls", "reviewerCalls", "totalModelCalls"]);
const safeEvents = new Set(["command.started", "provider.resolved", "grounding.completed", "grounding.rejected",
  "operation-catalog.created", "generator.request.started", "generator.response.received", "generator.rejected",
  "wire-plan.parsed", "wire-plan.rejected", "plan.resolved", "plan.rejected", "renderer.completed",
  "renderer.rejected", "reviewer.request.started", "reviewer.response.received", "reviewer.accepted",
  "reviewer.rejected", "reviewer.failed", "artifacts.created", "run.completed"]);
const absolutePath = /^(?:\/|[A-Za-z]:[\\/]|\\\\|file:)/iu;
const safeIdentifier = /^[A-Za-z0-9][A-Za-z0-9._:\/-]{0,127}$/;
function safeDiagnosticIdentifier(value: string): string | undefined {
  const trimmed = value.trim();
  if (absolutePath.test(trimmed)) return "<local-model-path-redacted>";
  return safeIdentifier.test(trimmed) && !trimmed.includes("//") ? trimmed : undefined;
}

export class DiagnosticRun {
  readonly #sink: DiagnosticSink | undefined;
  readonly #runId: string | undefined;
  readonly #started = Date.now();
  #completed = false;
  #generatorCalls = 0;
  #reviewerCalls = 0;
  #phase = "command";

  constructor(sink?: DiagnosticSink) { this.#sink = sink; this.#runId = sink === undefined ? undefined : globalThis.crypto.randomUUID(); }
  get generatorCalls(): number { return this.#generatorCalls; }
  get reviewerCalls(): number { return this.#reviewerCalls; }
  generatorStarted(): void { this.#generatorCalls += 1; }
  reviewerStarted(): void { this.#reviewerCalls += 1; }

  emit(event: string, fields: Readonly<Record<string, Field>> = {}): void {
    if (this.#sink === undefined || this.#completed || !safeEvents.has(event)) return;
    this.#phase = event.split(".")[0] ?? "command";
    const safe: Record<string, Field> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (!safeFieldKeys.has(key)) continue;
      if (typeof value === "number") {
        if (Number.isSafeInteger(value) && value >= 0) safe[key] = value;
      } else if (typeof value === "boolean" || value === null) safe[key] = value;
      else if (typeof value === "string") {
        const identifier = safeDiagnosticIdentifier(value);
        if (identifier !== undefined) safe[key] = identifier;
      } else if (Array.isArray(value) && value.length <= 16 && value.every((entry) => /^[A-Za-z][A-Za-z0-9-]{0,31}$/.test(entry))) safe[key] = value;
    }
    const line = JSON.stringify({ timestamp: new Date().toISOString(), runId: this.#runId, event, ...safe });
    if (line.length > diagnosticLineLimit) return;
    try { this.#sink(line); } catch { /* Diagnostics never change the pipeline. */ }
  }

  complete(status: string, code?: string, rule?: string): void {
    if (this.#completed) return;
    this.emit("run.completed", { status, finalPhase: this.#phase, ...(code === undefined ? {} : { code }),
      ...(rule === undefined ? {} : { rule }),
      generatorCalls: this.#generatorCalls, reviewerCalls: this.#reviewerCalls,
      totalModelCalls: this.#generatorCalls + this.#reviewerCalls, durationMs: Date.now() - this.#started });
    this.#completed = true;
  }
}
