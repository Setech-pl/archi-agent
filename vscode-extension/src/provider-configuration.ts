import * as vscode from "vscode";
import { settingKeys, settingsSection } from "./contributions.js";

// All provider publications in this host share one guard, including legacy materialization.
// VS Code updates are not atomic: compare the expected scoped values after every await.
const keys: readonly string[] = [settingKeys.localModelProfile, settingKeys.localModelBaseUrl, settingKeys.localModelId,
  settingKeys.localModelTimeoutSeconds, settingKeys.localModelSelectedModel, settingKeys.localModelSelectedModelProfile];
const scopes = ["defaultValue", "globalValue", "workspaceValue", "workspaceFolderValue",
  "defaultLanguageValue", "globalLanguageValue", "workspaceLanguageValue", "workspaceFolderLanguageValue"] as const;
let publication = 0;
let writing = false;

function values(resource?: vscode.Uri): unknown[][] {
  const configuration = vscode.workspace.getConfiguration(settingsSection, resource);
  return keys.map(key => {
    const inspected = configuration.inspect(key) as Record<string, unknown> | undefined;
    return scopes.map(scope => inspected?.[scope]);
  });
}
function sameValues(left: readonly unknown[][], right: readonly unknown[][]): boolean {
  // These settings are scalar. Preserve null/undefined (and invalid scalar values) distinctly.
  return left.every((row, index) => row.every((value, scope) => Object.is(value, right[index]?.[scope])));
}
function workspaceIdentity(): string {
  return JSON.stringify([vscode.workspace.isTrusted, (vscode.workspace.workspaceFolders ?? []).map(folder => folder.uri.toString())]);
}
export function captureProviderConfiguration(resource?: vscode.Uri) {
  // Subscribe synchronously, before the interaction's first await. Count relevant
  // events even when the final inspected values return to the captured values (ABA).
  const observation: { revision: number; disposed: boolean; ownUpdate?: { key: string; expected: unknown[][] } } = { revision: 0, disposed: false };
  const subscription = vscode.workspace.onDidChangeConfiguration(event => {
    // An explicit scope without a URI checks the unscoped effective settings;
    // omitting scope would also match changes confined to another workspace folder.
    const affected = keys.filter(key => event.affectsConfiguration(`${settingsSection}.${key}`, resource ?? { languageId: "" }));
    if (affected.length === 0) return;
    const own = observation.ownUpdate;
    // A publication may consume only its one expected update notification. Never
    // ignore a whole writing interval: external events must still invalidate it.
    if (own && affected.length === 1 && affected[0] === own.key && sameValues(own.expected, values(resource))) {
      observation.ownUpdate = undefined;
      return;
    }
    observation.revision++;
  });
  return { resource, publication, workspace: workspaceIdentity(), values: values(resource), revision: observation.revision, observation,
    dispose() { observation.disposed = true; subscription.dispose(); } };
}
type Snapshot = ReturnType<typeof captureProviderConfiguration>;
export function providerConfigurationIsCurrent(snapshot: Snapshot): boolean {
  return !snapshot.observation.disposed && !writing && snapshot.revision === snapshot.observation.revision &&
    snapshot.publication === publication && snapshot.workspace === workspaceIdentity() &&
    sameValues(snapshot.values, values(snapshot.resource));
}

export class ProviderConfigurationConflict extends Error {
  constructor() { super("Provider settings changed. Review the current configuration and retry."); }
}

/** Fail on conflict; never restore old values over another operation's newer settings. */
export async function publishProviderConfiguration(snapshot: Snapshot, updates: readonly (readonly [string, unknown])[], cancelled = () => false): Promise<Snapshot> {
  if (!providerConfigurationIsCurrent(snapshot)) throw new ProviderConfigurationConflict();
  writing = true;
  publication++;
  const expected = snapshot.values.map(row => [...row]);
  const check = () => {
    if (snapshot.observation.disposed || snapshot.revision !== snapshot.observation.revision ||
      snapshot.workspace !== workspaceIdentity() || !sameValues(expected, values(snapshot.resource)))
      throw new ProviderConfigurationConflict();
    if (cancelled()) throw new ProviderConfigurationConflict();
  };
  try {
    for (const [key, value] of updates) {
      check();
      const index = keys.indexOf(key);
      if (index < 0) throw new Error("Unsupported provider setting");
      const previous = expected[index]![scopes.indexOf("globalValue")];
      expected[index]![scopes.indexOf("globalValue")] = value;
      // No-op updates emit no VS Code change; they must not consume an external event.
      snapshot.observation.ownUpdate = Object.is(previous, value) ? undefined : { key, expected };
      try {
        await vscode.workspace.getConfiguration(settingsSection).update(key, value, vscode.ConfigurationTarget.Global);
      } finally {
        snapshot.observation.ownUpdate = undefined;
      }
      check();
    }
  } finally {
    publication++;
    writing = false;
  }
  // Keep the original observation/revision through the caller's publication await.
  return { ...snapshot, publication, values: expected };
}
