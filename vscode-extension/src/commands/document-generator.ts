import * as vscode from "vscode";
import type { GeneratorConfig } from "../../../src/runtime/index.js";
import { settingsSection } from "../contributions.js";
import { readLocalModelSettings } from "../settings.js";
import { readApiKey } from "../api-key-storage.js";
import { selectLocalModel } from "./local-provider-selection.js";
import type { GenerateCommandDependencies } from "./generate-sequence-diagram.js";
export function documentGenerator({runtime,output,secrets}:GenerateCommandDependencies,resource?:vscode.Uri,authorizeRemote=false) {
  return async (signal: AbortSignal): Promise<GeneratorConfig | undefined> => {
      const token: vscode.CancellationToken = {
        get isCancellationRequested() { return signal.aborted; },
        onCancellationRequested(listener, thisArg, disposables) {
          const fire = () => listener.call(thisArg, undefined);
          signal.addEventListener("abort", fire, { once: true });
          const subscription = { dispose: () => signal.removeEventListener("abort", fire) };
          disposables?.push(subscription);
          if (signal.aborted) queueMicrotask(fire);
          return subscription;
        }
      };
      if (signal.aborted) return undefined;
      let settings = readLocalModelSettings(vscode.workspace.getConfiguration(settingsSection, resource));
      if (!settings.ok) { await vscode.window.showErrorMessage(`Archi Agent: ${settings.problems.map((p) => p.message).join(" ")}`); return undefined; }
      if (!settings.settings.modelId) {
        const selection = await selectLocalModel(runtime, output, secrets, token, resource);
        if (signal.aborted || selection.status !== "selected") return undefined;
        settings = { ok: true, settings: selection.settings };
      }
      const model = settings.settings;
      if (!model.modelId) return undefined;
      const profile = runtime.listProviderProfiles().find((p) => p.profileId === model.profileId);
      if (!profile) throw { code: "unknown-provider-profile" };
      if(authorizeRemote&&profile.credentialRequirement==="api-key"){
        const pl=vscode.env.language.startsWith("pl"),action=pl?"Autoryzuję jedno płatne wywołanie":"Authorize one paid call";
        const consent=await vscode.window.showWarningMessage(pl?`Archi Agent: ${profile.displayName} / ${model.modelId}. Ta operacja może być płatna. Maksymalnie 1 wywołanie, bez retry.`:`Archi Agent: ${profile.displayName} / ${model.modelId}. This operation may incur charges. Maximum 1 call, no retries.`,{modal:true},action);
        if(signal.aborted||consent!==action)return undefined;
      }
      const key = secrets ? await readApiKey(secrets, profile) : undefined;
      if (signal.aborted) return undefined;
      if (profile.credentialRequirement === "api-key" && !key) throw { code: "credential-required" };
      return model.baseUrl ? { kind: "openai-compatible-local", profileId: model.profileId, baseUrl: model.baseUrl, modelId: model.modelId, timeoutMs: model.timeoutMs } :
        { kind: "remote-provider", profileId: model.profileId, modelId: model.modelId, timeoutMs: model.timeoutMs, ...(key ? { credential: { type: "api-key", value: key } } : {}) };
    };
}
