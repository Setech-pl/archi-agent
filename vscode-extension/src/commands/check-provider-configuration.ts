import * as vscode from "vscode";
import { classifyProviderDiagnostic, type ArchiAgentRuntime, type ProviderDiagnostic } from "../../../src/runtime/index.js";
import { readApiKey } from "../api-key-storage.js";
import { settingKeys, settingsSection } from "../contributions.js";
import { readLocalModelSettings } from "../settings.js";
import { describeProviderDiagnostic } from "../user-messages.js";
import { cancellationSignal, profileSelection } from "./local-provider-selection.js";

async function report(output: vscode.OutputChannel, diagnostic: ProviderDiagnostic): Promise<void> {
  const message = describeProviderDiagnostic(diagnostic);
  output.appendLine(message.text);
  for (const line of message.details) output.appendLine(`  ${line}`);
  if (diagnostic.execution === "cancelled") return;
  if (message.level === "error") await vscode.window.showErrorMessage(message.text);
  else await vscode.window.showInformationMessage(message.text);
}

/** A check makes at most one existing model-list request. It never generates or changes settings. */
export async function checkProviderConfiguration(runtime: ArchiAgentRuntime, output: vscode.OutputChannel, secrets?: vscode.SecretStorage): Promise<void> {
  const configuration = vscode.workspace.getConfiguration(settingsSection);
  const settings = readLocalModelSettings(configuration);
  if (!settings.ok) {
    const configuredProfile = configuration.inspect(settingKeys.localModelProfile)?.globalValue;
    await report(output, classifyProviderDiagnostic({
      profileId: typeof configuredProfile === "string" ? configuredProfile : "local-lm-studio",
      operation: "listing", credentialRequired: typeof configuredProfile === "string" && configuredProfile.startsWith("cloud-"),
      outcome: "failure", code: settings.problems[0]?.code
    }));
    return;
  }
  const selected = settings.settings;
  const profile = runtime.listProviderProfiles().find((item) => item.profileId === selected.profileId);
  if (profile === undefined) {
    await report(output, classifyProviderDiagnostic({ profileId: selected.profileId, operation: "listing", credentialRequired: false,
      outcome: "failure", code: "unknown-provider-profile" }));
    return;
  }
  let key: string | undefined;
  try {
    key = secrets === undefined ? undefined : await readApiKey(secrets, profile);
  } catch {
    await report(output, classifyProviderDiagnostic({ profileId: profile.profileId, operation: "listing", credentialRequired: true,
      outcome: "failure", code: "secret-storage-read-failed" }));
    return;
  }
  if (profile.credentialRequirement === "api-key" && key === undefined) {
    await report(output, classifyProviderDiagnostic({ profileId: profile.profileId, operation: "listing", credentialRequired: true,
      outcome: "failure", code: "credential-required" }));
    return;
  }
  const listed = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Archi Agent: checking ${profile.displayName}`, cancellable: true },
    (_progress, token) => runtime.listProviderModels(profileSelection(selected, key), { signal: cancellationSignal(token) })
  );
  await report(output, classifyProviderDiagnostic({
    profileId: profile.profileId, operation: "listing", credentialRequired: profile.credentialRequirement === "api-key",
    outcome: listed.ok ? "success" : listed.code === "cancelled" ? "cancelled" : "failure",
    ...(listed.ok ? {} : { code: listed.code }),
    modelSelected: selected.modelId !== undefined,
    selectedModelListed: listed.ok && selected.modelId !== undefined && listed.models.includes(selected.modelId)
  }));
}
