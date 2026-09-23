import path from "node:path";
import * as vscode from "vscode";
import type { AmbiguityChoice, ArchiAgentRuntime, CancellationSignal, DiagramType, FlowSource, GenerateDiagramUnverified, GenerateSequenceDiagramSuccess } from "../../../src/runtime/index.js";
import { settingsSection } from "../contributions.js";
import { readApiKey } from "../api-key-storage.js";
import { readArchiAgentSettings, type ArchiAgentSettings } from "../settings.js";
import {
  describeCancellation,
  describeFailure,
  describeSettingsProblems,
  describeSuccess,
  type UserMessage
} from "../user-messages.js";
import { buildGenerationRequest, runSequenceGenerationSession, type ResolutionPrompts } from "./sequence-generation-session.js";
import { selectLocalModel } from "./local-provider-selection.js";

/**
 * The editor-bound side of the generate command. It collects input with the editor API, hands the
 * request to the runtime through the editor-independent session, and shows the result: the PlantUML
 * in an untitled editor, the grounding report beside it, and safe diagnostics in the output channel.
 * Nothing is written to disk and nothing but codes, messages, positions and counts is logged.
 */

export interface GenerateCommandDependencies {
  readonly runtime: ArchiAgentRuntime;
  readonly output: vscode.OutputChannel;
  readonly secrets?: vscode.SecretStorage;
}

const openSettingsAction = "Open Settings";
const showDetailsAction = "Show Details";
const showUnverifiedAction = "Show unverified candidate";
const cancelUnverifiedAction = "Cancel";
const safeReviewProblems = new Set(["truncated-output", "timeout", "connection-failed", "response-truncated",
  "response-too-large", "provider-unavailable", "response-refused", "invalid-verdict", "request-failed"]);
const safeReviewViolations = new Set(["unsupported-user-stated-evidence", "sequence-inconsistency",
  "participant-inconsistency", "candidate-semantics-invalid"]);
const flowFileFilters = { "Flow documents": ["md", "txt"], "All files": ["*"] };
const maxInlineFlowChars = 256;

interface FlowSourceItem extends vscode.QuickPickItem {
  readonly source: "active-document" | "file" | "description";
}

interface CandidateItem extends vscode.QuickPickItem {
  readonly id: string;
}

async function openSettings(): Promise<void> {
  await vscode.commands.executeCommand("workbench.action.openSettings", settingsSection);
}

async function show(output: vscode.OutputChannel, message: UserMessage): Promise<void> {
  output.appendLine(message.text);

  for (const line of message.details) {
    output.appendLine(`  ${line}`);
  }

  const actions = [...(message.details.length > 0 ? [showDetailsAction] : []), ...(message.suggestSettings ? [openSettingsAction] : [])];
  const notify =
    message.level === "error" ? vscode.window.showErrorMessage : message.level === "warning" ? vscode.window.showWarningMessage : vscode.window.showInformationMessage;
  const chosen = await notify(message.text, ...actions);

  if (chosen === showDetailsAction) {
    output.show(true);
  } else if (chosen === openSettingsAction) {
    await openSettings();
  }
}

function cancellationSignal(token: vscode.CancellationToken): CancellationSignal {
  const subscriptions = new Map<() => void, vscode.Disposable>();

  return {
    get aborted(): boolean {
      return token.isCancellationRequested;
    },
    addEventListener(type: string, listener: () => void): void {
      if (type === "abort" && !subscriptions.has(listener)) {
        subscriptions.set(listener, token.onCancellationRequested(() => listener()));
      }
    },
    removeEventListener(type: string, listener: () => void): void {
      if (type === "abort") {
        subscriptions.get(listener)?.dispose();
        subscriptions.delete(listener);
      }
    }
  } as CancellationSignal;
}

async function pickFlowSource(settings: ArchiAgentSettings): Promise<FlowSource | undefined> {
  const editor = vscode.window.activeTextEditor;
  const items: FlowSourceItem[] = [];

  if (editor !== undefined) {
    items.push({
      label: "$(file) Use the active editor document",
      description: editor.document.isUntitled ? "untitled" : path.basename(editor.document.fileName),
      detail: "A complete flow document: front matter (diagram_name, flow_name, author) followed by the description.",
      source: "active-document"
    });
  }

  items.push(
    { label: "$(folder-opened) Choose a flow file...", detail: "A Markdown flow document on the local file system.", source: "file" },
    {
      label: "$(edit) Describe a flow...",
      detail: "Type a flow name and a one-line description; Archi Agent adds the front matter.",
      source: "description"
    }
  );

  const picked = await vscode.window.showQuickPick(items, { title: "Archi Agent: flow source", placeHolder: "Where is the flow description?" });

  if (picked === undefined) {
    return undefined;
  }

  if (picked.source === "active-document" && editor !== undefined) {
    return {
      kind: "document",
      text: editor.document.getText(),
      ...(editor.document.isUntitled ? {} : { fileName: path.basename(editor.document.fileName) })
    };
  }

  if (picked.source === "file") {
    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      openLabel: "Use flow file",
      filters: flowFileFilters,
      title: "Archi Agent: choose a flow document"
    });
    const uri = uris?.[0];

    if (uri === undefined) {
      return undefined;
    }

    if (uri.scheme === "file") {
      return { kind: "file", path: uri.fsPath };
    }

    const document = await vscode.workspace.openTextDocument(uri);
    return { kind: "document", text: document.getText(), fileName: path.basename(uri.path) };
  }

  const flowName = await vscode.window.showInputBox({
    title: "Archi Agent: flow name",
    prompt: "Short name of the flow, for example Telemetry command flow.",
    ignoreFocusOut: true,
    validateInput: (value) => (value.trim() === "" ? "Enter a flow name." : value.length > maxInlineFlowChars ? "The flow name is too long." : undefined)
  });

  if (flowName === undefined) {
    return undefined;
  }

  const description = await vscode.window.showInputBox({
    title: "Archi Agent: flow description",
    prompt: "Describe the flow. Refer to architecture elements by their canonical names or aliases; mark elements outside the Knowledge Pack as [NEW: Name].",
    ignoreFocusOut: true,
    validateInput: (value) => (value.trim() === "" ? "Enter a description." : undefined)
  });

  if (description === undefined) {
    return undefined;
  }

  return { kind: "description", flowName: flowName.trim(), description: description.trim(), author: settings.defaultAuthor };
}

function resolutionPrompts(): ResolutionPrompts {
  return {
    async selectAmbiguityCandidate(choice: AmbiguityChoice): Promise<string | undefined> {
      const items: CandidateItem[] = choice.candidates.map((candidate) => ({
        label: candidate.canonicalName,
        description: candidate.id,
        detail: `${candidate.participantType} (${candidate.elementKind}), declared in ${candidate.sourceFile} line ${candidate.sourceLine}`,
        id: candidate.id
      }));
      const lines = choice.lines.length === 0 ? "" : ` (flow line${choice.lines.length === 1 ? "" : "s"} ${choice.lines.join(", ")})`;
      const picked = await vscode.window.showQuickPick(items, {
        title: `Archi Agent: "${choice.mention}" is ambiguous${lines}`,
        placeHolder: "Select the architecture element the flow refers to",
        ignoreFocusOut: true
      });
      return picked?.id;
    },
    async confirmNewParticipants(names: readonly string[]): Promise<readonly string[] | undefined> {
      const picked = await vscode.window.showQuickPick(
        names.map((name) => ({ label: name, detail: "Declared as [NEW: ...] in the flow; not part of the Knowledge Pack." })),
        {
          title: "Archi Agent: confirm new participants",
          placeHolder: "Select the [NEW: ...] participants to add to the diagram; unselected markers keep the flow blocked",
          canPickMany: true,
          ignoreFocusOut: true
        }
      );
      return picked === undefined ? undefined : picked.map((item) => item.label);
    }
  };
}

async function openGeneratedDocuments(result: GenerateSequenceDiagramSuccess): Promise<void> {
  const languages = await vscode.languages.getLanguages();
  const diagram = await vscode.workspace.openTextDocument({
    language: languages.includes("plantuml") ? "plantuml" : "plaintext",
    content: result.plantUml
  });
  await vscode.window.showTextDocument(diagram, { viewColumn: vscode.ViewColumn.Active, preview: false });
  const report = await vscode.workspace.openTextDocument({ language: "json", content: result.groundingReport });
  await vscode.window.showTextDocument(report, { viewColumn: vscode.ViewColumn.Beside, preview: false, preserveFocus: true });
}

function safeUnverifiedReason(result: GenerateDiagramUnverified): string {
  if (result.review.status === "failed") return safeReviewProblems.has(result.review.problemCode) ? result.review.problemCode : "request-failed";
  const codes = result.review.violationCodes.filter((code) => safeReviewViolations.has(code));
  return codes.length > 0 ? [...new Set(codes)].join(", ") : "candidate-semantics-invalid";
}

function unverifiedDocument(result: GenerateDiagramUnverified, reason: string): string {
  const status = `${result.review.status} (${reason})`;
  const header = ["' ARCHI AGENT — UNVERIFIED CANDIDATE", "' Local structural and grounding checks passed.",
    `' Semantic review status: ${status}`, "' Do not treat this document as a verified architecture artifact."];
  return result.plantUmlCandidate.replace(/^@startuml\r?\n/u, `@startuml\n${header.join("\n")}\n`);
}

async function offerUnverifiedCandidate(result: GenerateDiagramUnverified, output: vscode.OutputChannel, verbose: boolean): Promise<void> {
  const reason = safeUnverifiedReason(result);
  const lead = result.review.status === "failed" ? "Semantic review did not complete" : "Semantic review rejected the candidate";
  const message = `${lead} (${reason}). The diagram passed local structural and grounding checks but remains unverified. Do you want to inspect the candidate?`;
  if (verbose) output.appendLine(JSON.stringify({ event: "unverified-candidate.offered", code: reason }));
  const chosen = await vscode.window.showWarningMessage(message, { modal: true }, showUnverifiedAction, cancelUnverifiedAction);
  if (chosen !== showUnverifiedAction) {
    if (verbose) output.appendLine(JSON.stringify({ event: "unverified-candidate.dismissed" }));
    return;
  }
  const languages = await vscode.languages.getLanguages();
  const document = await vscode.workspace.openTextDocument({ language: languages.includes("plantuml") ? "plantuml" : "plaintext",
    content: unverifiedDocument(result, reason) });
  await vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.Active, preview: false });
  if (verbose) output.appendLine(JSON.stringify({ event: "unverified-candidate.opened" }));
}

export async function generateDiagramCommand(dependencies: GenerateCommandDependencies): Promise<void> {
  const picked = await vscode.window.showQuickPick([{ label: "Sequence", description: "sequence", id: "sequence" as const }],
    { title: "Archi Agent: diagram type", placeHolder: "Select a diagram type" });
  if (picked === undefined) return;
  await runGenerateCommand(dependencies, picked.id);
}

export async function generateSequenceDiagramCommand(dependencies: GenerateCommandDependencies): Promise<void> {
  await runGenerateCommand(dependencies);
}

async function runGenerateCommand(dependencies: GenerateCommandDependencies, diagramType?: DiagramType): Promise<void> {
  const { runtime, output, secrets } = dependencies;
  const settingsResult = readArchiAgentSettings(vscode.workspace.getConfiguration(settingsSection));

  if (!settingsResult.ok) {
    await show(output, describeSettingsProblems(settingsResult.problems));
    return;
  }

  let settings = settingsResult.settings;
  const profile = runtime.listProviderProfiles().find((candidate) => candidate.profileId === settings.localModel.profileId);
  if (profile === undefined) {
    await show(output, {
      level: "error",
      text: "Archi Agent: the selected provider profile is not registered.",
      details: Object.freeze(["[unknown-provider-profile] provider configuration failed"]),
      suggestSettings: true
    });
    return;
  }
  const flow = await pickFlowSource(settings);

  if (flow === undefined) {
    return;
  }

  if (settings.localModel.modelId === undefined) {
    const selection = await selectLocalModel(runtime, output, secrets);

    if (selection.status !== "selected" || selection.settings.modelId === undefined) {
      return;
    }

    settings = Object.freeze({ ...settings, localModel: selection.settings });
  }

  const modelId = settings.localModel.modelId;

  if (modelId === undefined) {
    return;
  }

  let apiKey: string | undefined;
  try {
    apiKey = secrets === undefined ? undefined : await readApiKey(secrets, profile);
  } catch {
    await show(output, {
      level: "error",
      text: "Archi Agent: secure key storage could not be read.",
      details: Object.freeze(["[secret-storage-read-failed] provider request blocked before network I/O"]),
      suggestSettings: false
    });
    return;
  }
  if (profile.credentialRequirement === "api-key" && apiKey === undefined) {
    await show(output, {
      level: "error",
      text: `Archi Agent: no valid API key is saved for ${profile.displayName}. Run “Archi Agent: Set or Update API Key”.`,
      details: Object.freeze(["[credential-required] provider request blocked before network I/O"]),
      suggestSettings: false
    });
    return;
  }

  const outcome = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Archi Agent: generating sequence diagram", cancellable: true },
    (_progress, token) =>
      runSequenceGenerationSession({
        runtime,
        request: buildGenerationRequest(settings, flow, modelId, cancellationSignal(token), apiKey),
        ...(diagramType === undefined ? {} : { diagramType }),
        ...(diagramType === undefined || vscode.workspace.getConfiguration(settingsSection).get("diagnostics.verbose") !== true
          ? {} : { diagnosticSink: (line: string) => output.appendLine(line) }),
        prompts: resolutionPrompts()
      })
  );

  if (outcome.status === "cancelled") {
    await show(output, describeCancellation());
    return;
  }

  if (outcome.result.status === "failed") {
    await show(output, describeFailure(outcome.result, { providerName: profile.displayName, baseUrl: settings.localModel.baseUrl }));
    return;
  }

  if (outcome.result.status === "unverified") {
    await offerUnverifiedCandidate(outcome.result, output, vscode.workspace.getConfiguration(settingsSection).get("diagnostics.verbose") === true);
    return;
  }

  await openGeneratedDocuments(outcome.result);
  await show(output, describeSuccess(outcome.result));
}
