import { afterEach, describe, expect, it } from "vitest";
import { createArchiAgentRuntime, type ArchiAgentRuntime } from "../../src/runtime/index.js";
import { deleteApiKey, readApiKey, secretIdForProfile, storeApiKey } from "../../vscode-extension/src/api-key-storage.js";
import { removeApiKey, setApiKey } from "../../vscode-extension/src/commands/api-key-management.js";
import { selectModel } from "../../vscode-extension/src/commands/local-provider-selection.js";
import { settingKeys, settingsSection } from "../../vscode-extension/src/contributions.js";
import * as vscodeDouble from "../doubles/vscode-module-double.js";

const { state, resetDouble, secretStorage } = vscodeDouble;
const runtime = createArchiAgentRuntime();
const output = () => vscodeDouble.window.createOutputChannel("Archi Agent");

function profile(profileId: string): void {
  state.configurationInspect.set(`${settingsSection}.${settingKeys.localModelProfile}`, { globalValue: profileId });
}

afterEach(resetDouble);

describe("VS Code API key management", () => {
  function registeredProfile(profileId: string) {
    const found = runtime.listProviderProfiles().find((candidate) => candidate.profileId === profileId);
    if (found === undefined) throw new Error("missing test profile");
    return found;
  }

  it("stores separate provider keys only in SecretStorage with password input", async () => {
    profile("cloud-openai");
    state.inputBoxAnswers.push("synthetic-openai-secret");
    await setApiKey(runtime, secretStorage as never, output() as never);
    const id = secretIdForProfile("cloud-openai") ?? "";
    expect(state.secrets.get(id)).toBe("synthetic-openai-secret");
    expect(state.secretWrites).toEqual([{ key: id, value: "synthetic-openai-secret" }]);
    expect(state.inputBoxes[0]).toMatchObject({ password: true });
    expect([...state.configuration.values()]).not.toContain("synthetic-openai-secret");
    expect(state.outputLines.join("\n")).not.toContain("synthetic-openai-secret");
  });

  it("writes nothing on cancellation or empty input", async () => {
    profile("cloud-anthropic");
    state.inputBoxAnswers.push(undefined);
    await setApiKey(runtime, secretStorage as never, output() as never);
    state.inputBoxAnswers.push("");
    await setApiKey(runtime, secretStorage as never, output() as never);
    expect(state.secretWrites).toEqual([]);
    expect(state.secrets.size).toBe(0);
  });

  it("uses the shared 1–1024 character validation before SecretStorage.store", async () => {
    const cloud = registeredProfile("cloud-openai");
    await storeApiKey(secretStorage as never, cloud, "a");
    await storeApiKey(secretStorage as never, cloud, "x".repeat(1024));
    expect(state.secretWrites.map((entry) => entry.value.length)).toEqual([1, 1024]);

    for (const invalid of ["x".repeat(1025), " padded", "padded ", "   ", `inside${String.fromCharCode(0)}control`, `inside${String.fromCharCode(9)}control`]) {
      const before = state.secretWrites.length;
      await expect(storeApiKey(secretStorage as never, cloud, invalid)).rejects.toThrow("invalid-api-key");
      expect(state.secretWrites).toHaveLength(before);
      expect(state.outputLines.join("\n")).not.toContain(invalid);
    }
  });

  it("reads only a valid cloud key and never reads SecretStorage for a local profile", async () => {
    const cloud = registeredProfile("cloud-openai");
    const local = registeredProfile("local-ollama");
    const id = secretIdForProfile(cloud.profileId) ?? "";
    state.secrets.set(id, "valid-key");
    await expect(readApiKey(secretStorage as never, cloud)).resolves.toBe("valid-key");
    await expect(readApiKey(secretStorage as never, local)).resolves.toBeUndefined();
    expect(state.secretReads).toEqual([id]);

    state.secrets.set(id, `invalid${String.fromCharCode(10)}key`);
    await expect(readApiKey(secretStorage as never, cloud)).resolves.toBeUndefined();
  });

  it("deletes only the active provider key after explicit confirmation", async () => {
    const openAi = secretIdForProfile("cloud-openai") ?? "";
    const openRouter = secretIdForProfile("cloud-openrouter") ?? "";
    state.secrets.set(openAi, "openai-secret");
    state.secrets.set(openRouter, "router-secret");
    profile("cloud-openai");
    state.messageAnswers.push(undefined);
    await removeApiKey(runtime, secretStorage as never, output() as never);
    expect(state.secretDeletes).toEqual([]);
    state.messageAnswers.push("Delete API Key");
    await removeApiKey(runtime, secretStorage as never, output() as never);
    expect(state.secretDeletes).toEqual([openAi]);
    expect(state.secrets.get(openRouter)).toBe("router-secret");
  });

  it("keeps deterministic state for controlled get, store and delete failures", async () => {
    const id = secretIdForProfile("cloud-openrouter") ?? "";
    const cloud = registeredProfile("cloud-openrouter");
    state.secrets.set(id, "preserved-secret");
    profile("cloud-openrouter");

    state.secretFailures.add("get");
    await removeApiKey(runtime, secretStorage as never, output() as never);
    expect(state.secrets.get(id)).toBe("preserved-secret");
    expect(state.messages.at(-1)?.text).toContain("could not be read");
    state.secretFailures.delete("get");

    state.secretFailures.add("store");
    await expect(storeApiKey(secretStorage as never, cloud, "replacement-secret")).rejects.toThrow();
    expect(state.secrets.get(id)).toBe("preserved-secret");
    state.secretFailures.delete("store");

    state.messageAnswers.push("Delete API Key");
    state.secretFailures.add("delete");
    await removeApiKey(runtime, secretStorage as never, output() as never);
    expect(state.secrets.get(id)).toBe("preserved-secret");
    expect(state.secretDeletes).toEqual([]);
    state.secretFailures.delete("delete");

    await deleteApiKey(secretStorage as never, cloud);
    expect(state.secrets.has(id)).toBe(false);
  });

  it("never asks local profiles for a key", async () => {
    profile("local-ollama");
    await setApiKey(runtime, secretStorage as never, output() as never);
    expect(state.inputBoxes).toEqual([]);
    expect(state.secretWrites).toEqual([]);
    expect(state.secretReads).toEqual([]);
    expect(state.messages[0]?.text).toContain("does not use an API key");
  });

  it("blocks cloud model listing before runtime I/O when no key is saved", async () => {
    profile("cloud-openai");
    let listings = 0;
    const guarded: ArchiAgentRuntime = {
      listProviderProfiles: () => runtime.listProviderProfiles(),
      async listProviderModels() {
        listings += 1;
        return { ok: true as const, models: ["must-not-be-read"] };
      },
      listLocalModels: (endpoint, options) => runtime.listLocalModels(endpoint, options),
      generateSequenceDiagram: (request) => runtime.generateSequenceDiagram(request)
    };
    await expect(selectModel(guarded, output() as never, secretStorage as never)).resolves.toEqual({ status: "failed" });
    expect(listings).toBe(0);
    expect(state.progressTitles).toEqual([]);
    expect(state.messages[0]?.text).toContain("credential-required");
  });

  it("does not read any secret while choosing or cancelling a provider profile", async () => {
    const { selectProviderProfile } = await import("../../vscode-extension/src/commands/local-provider-selection.js");
    await expect(selectProviderProfile(runtime, output() as never)).resolves.toEqual({ status: "cancelled" });
    expect(state.secretReads).toEqual([]);
    expect(state.secretWrites).toEqual([]);
  });

  it("reports SecretStorage write failure without logging the key", async () => {
    profile("cloud-openrouter");
    state.inputBoxAnswers.push("never-log-this-secret");
    state.secretFailures.add("store");
    await setApiKey(runtime, secretStorage as never, output() as never);
    expect(state.secretWrites).toEqual([]);
    expect(state.outputLines.join("\n")).not.toContain("never-log-this-secret");
    expect(state.messages.at(-1)?.level).toBe("error");
  });
});
