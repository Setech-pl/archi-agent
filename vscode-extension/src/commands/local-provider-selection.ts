import * as vscode from "vscode";
import type { ArchiAgentRuntime, CancellationSignal, ProviderProfile } from "../../../src/runtime/index.js";
import { localLmStudioProfileId } from "../../../src/runtime/index.js";
import { settingKeys, settingsSection } from "../contributions.js";
import { readLocalModelSettings, type LocalModelSettings, type SettingsProblem } from "../settings.js";
import { describeModelListFailure, describeSettingsProblems } from "../user-messages.js";

interface ProviderItem extends vscode.QuickPickItem {
  readonly profile: ProviderProfile;
}

interface ModelItem extends vscode.QuickPickItem {
  readonly modelId: string;
}

export type LocalSelectionOutcome =
  | { readonly status: "selected"; readonly settings: LocalModelSettings }
  | { readonly status: "cancelled" }
  | { readonly status: "failed" };

const openSettingsAction = "Open Settings";
const showDetailsAction = "Show Details";

function cancellationSignal(token: vscode.CancellationToken): CancellationSignal {
  const subscriptions = new Map<() => void, vscode.Disposable>();

  return {
    get aborted(): boolean {
      return token.isCancellationRequested;
    },
    addEventListener(type: string, listener: () => void): void {
      if (type === "abort" && !subscriptions.has(listener)) {
        subscriptions.set(listener, token.onCancellationRequested(listener));
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

function currentSettings() {
  return readLocalModelSettings(vscode.workspace.getConfiguration(settingsSection));
}

function profileSelection(settings: LocalModelSettings): { readonly profileId: string; readonly timeoutMs: number; readonly baseUrl?: string } {
  return Object.freeze({
    profileId: settings.profileId,
    timeoutMs: settings.timeoutMs,
    ...(settings.profileId === localLmStudioProfileId ? { baseUrl: settings.baseUrl } : {})
  });
}

async function notifyWriteFailure(output: vscode.OutputChannel, text: string): Promise<void> {
  output.appendLine(text);
  await vscode.window.showErrorMessage(text);
}

async function notifySettingsFailure(output: vscode.OutputChannel, problems: readonly SettingsProblem[]): Promise<void> {
  const message = describeSettingsProblems(problems);
  output.appendLine(message.text);
  for (const detail of message.details) output.appendLine(`  ${detail}`);
  await vscode.window.showErrorMessage(message.text);
}

async function showModelListFailure(output: vscode.OutputChannel, code: string, baseUrl: string): Promise<void> {
  const message = describeModelListFailure(code, baseUrl);
  output.appendLine(message.text);
  for (const detail of message.details) output.appendLine(`  ${detail}`);
  const chosen = await vscode.window.showErrorMessage(message.text, showDetailsAction, openSettingsAction);

  if (chosen === showDetailsAction) {
    output.show(true);
  } else if (chosen === openSettingsAction) {
    await vscode.commands.executeCommand("workbench.action.openSettings", settingsSection);
  }
}

/** Selects identity metadata only. It never asks a provider or performs any other network I/O. */
export async function selectLocalProviderProfile(runtime: ArchiAgentRuntime, output: vscode.OutputChannel): Promise<LocalSelectionOutcome> {
  const currentResult = currentSettings();

  if (!currentResult.ok) {
    await notifySettingsFailure(output, currentResult.problems);
    return Object.freeze({ status: "failed" });
  }

  const current = currentResult.settings;

  const items: ProviderItem[] = runtime.listProviderProfiles().map((profile) => ({
    label: profile.displayName,
    description: profile.profileId === current.profileId ? "$(check) Current profile" : profile.profileId,
    detail: profile.providerKind,
    profile
  }));
  const picked = await vscode.window.showQuickPick(items, {
    title: "Archi Agent: select the local provider profile",
    placeHolder: "Selecting a profile does not contact its server",
    ignoreFocusOut: true
  });

  if (picked === undefined) {
    return Object.freeze({ status: "cancelled" });
  }

  if (current.selectionMode === "profile" && picked.profile.profileId === current.profileId) {
    return Object.freeze({ status: "selected", settings: current });
  }

  const configuration = vscode.workspace.getConfiguration(settingsSection);

  try {
    await configuration.update(settingKeys.localModelSelectedModel, undefined, vscode.ConfigurationTarget.Global);
  } catch {
    await notifyWriteFailure(output, "Archi Agent: the selected model could not be cleared, so the provider profile was not changed.");
    return Object.freeze({ status: "failed" });
  }

  try {
    await configuration.update(settingKeys.localModelSelectedModelProfile, undefined, vscode.ConfigurationTarget.Global);
  } catch {
    await notifyWriteFailure(output, "Archi Agent: the selected model binding could not be cleared, so the provider profile was not changed.");
    return Object.freeze({ status: "failed" });
  }

  try {
    await configuration.update(settingKeys.localModelProfile, picked.profile.profileId, vscode.ConfigurationTarget.Global);
  } catch {
    await notifyWriteFailure(output, "Archi Agent: the provider profile could not be stored in the local user settings.");
    return Object.freeze({ status: "failed" });
  }

  const updated = currentSettings();
  return updated.ok ? Object.freeze({ status: "selected", settings: updated.settings }) : Object.freeze({ status: "failed" });
}

/** Performs one explicit model-list request, then stores a choice in machine-scoped global settings. */
export async function selectLocalModel(runtime: ArchiAgentRuntime, output: vscode.OutputChannel): Promise<LocalSelectionOutcome> {
  const currentResult = currentSettings();

  if (!currentResult.ok) {
    await notifySettingsFailure(output, currentResult.problems);
    return Object.freeze({ status: "failed" });
  }

  const current = currentResult.settings;

  const listed = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Archi Agent: listing local models", cancellable: true },
    (_progress, token) => runtime.listProviderModels(profileSelection(current), { signal: cancellationSignal(token) })
  );

  if (!listed.ok) {
    await showModelListFailure(output, listed.code, current.baseUrl);
    return Object.freeze({ status: "failed" });
  }

  if (listed.models.length === 0) {
    await showModelListFailure(output, "no-models", current.baseUrl);
    return Object.freeze({ status: "failed" });
  }

  const items: ModelItem[] = listed.models.map((modelId) => ({
    label: modelId,
    description: modelId === current.modelId ? "$(check) Current model" : undefined,
    modelId
  }));
  const picked = await vscode.window.showQuickPick(items, {
    title: "Archi Agent: select the local model",
    placeHolder: `Models reported by ${current.baseUrl}`,
    ignoreFocusOut: true
  });

  if (picked === undefined) {
    return Object.freeze({ status: "cancelled" });
  }

  const configuration = vscode.workspace.getConfiguration(settingsSection);

  if (current.selectionMode === "legacy") {
    try {
      await configuration.update(settingKeys.localModelSelectedModel, picked.modelId, vscode.ConfigurationTarget.Global);
    } catch {
      await notifyWriteFailure(output, "Archi Agent: the selected model could not be stored in the local user settings.");
      return Object.freeze({ status: "failed" });
    }

    try {
      await configuration.update(settingKeys.localModelSelectedModelProfile, current.profileId, vscode.ConfigurationTarget.Global);
    } catch {
      await notifyWriteFailure(output, "Archi Agent: the selected model binding could not be stored in the local user settings.");
      return Object.freeze({ status: "failed" });
    }

    try {
      await configuration.update(settingKeys.localModelProfile, current.profileId, vscode.ConfigurationTarget.Global);
    } catch {
      await notifyWriteFailure(output, "Archi Agent: the provider profile could not be stored in the local user settings.");
      return Object.freeze({ status: "failed" });
    }
  } else {
    try {
      await configuration.update(settingKeys.localModelSelectedModelProfile, undefined, vscode.ConfigurationTarget.Global);
    } catch {
      await notifyWriteFailure(output, "Archi Agent: the previous selected model binding could not be cleared.");
      return Object.freeze({ status: "failed" });
    }

    try {
      await configuration.update(settingKeys.localModelSelectedModel, picked.modelId, vscode.ConfigurationTarget.Global);
    } catch {
      await notifyWriteFailure(output, "Archi Agent: the selected model could not be stored in the local user settings.");
      return Object.freeze({ status: "failed" });
    }

    try {
      await configuration.update(settingKeys.localModelSelectedModelProfile, current.profileId, vscode.ConfigurationTarget.Global);
    } catch {
      await notifyWriteFailure(output, "Archi Agent: the selected model binding could not be stored in the local user settings.");
      return Object.freeze({ status: "failed" });
    }
  }

  const updated = currentSettings();
  return updated.ok ? Object.freeze({ status: "selected", settings: updated.settings }) : Object.freeze({ status: "failed" });
}
