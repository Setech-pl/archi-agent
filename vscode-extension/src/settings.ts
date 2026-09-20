import path from "node:path";
import {
  defaultBaseUrlForLocalProfile,
  defaultLocalModelBaseUrl,
  isSafeModelId,
  localLmStudioProfileId,
  parseLoopbackEndpoint,
  runtimeLimits
} from "../../src/runtime/index.js";
import { settingKeys } from "./contributions.js";

/**
 * Reads and checks the Archi Agent settings. The reader is the small part of the editor
 * configuration object this module needs, so the parsing is testable without the editor API.
 * Problems name the setting and carry a fixed message; they never echo the configured value.
 */

/** Structurally compatible with the editor's WorkspaceConfiguration.get(section). */
export interface SettingsReader {
  get(section: string): unknown;
  inspect(section: string):
    | {
        readonly defaultValue?: unknown;
        readonly globalValue?: unknown;
        readonly workspaceValue?: unknown;
        readonly workspaceFolderValue?: unknown;
      }
    | undefined;
}

export interface LocalModelSettings {
  readonly selectionMode: "legacy" | "profile";
  readonly profileId: string;
  readonly baseUrl: string;
  /** Undefined until the user configured or picked a model; the runtime never chooses one. */
  readonly modelId: string | undefined;
  readonly timeoutMs: number;
}

export interface ArchiAgentSettings {
  readonly knowledgePackPath: string;
  readonly localModel: LocalModelSettings;
  readonly defaultAuthor: string;
}

export type SettingsProblemCode =
  | "knowledge-pack-path-missing"
  | "knowledge-pack-path-not-absolute"
  | "unknown-provider-profile"
  | "local-model-base-url-invalid"
  | "local-model-id-invalid"
  | "local-model-timeout-invalid"
  | "default-author-invalid";

export interface SettingsProblem {
  readonly code: SettingsProblemCode;
  /** Full setting identifier, for example archiAgent.knowledgePackPath. */
  readonly setting: string;
  readonly message: string;
}

export type SettingsResult =
  | { readonly ok: true; readonly settings: ArchiAgentSettings }
  | { readonly ok: false; readonly problems: readonly SettingsProblem[] };

export type LocalModelSettingsResult =
  | { readonly ok: true; readonly settings: LocalModelSettings }
  | { readonly ok: false; readonly problems: readonly SettingsProblem[] };

export const settingsLimits = Object.freeze({
  minTimeoutSeconds: 1,
  maxTimeoutSeconds: runtimeLimits.maxTimeoutMs / 1000,
  defaultTimeoutSeconds: runtimeLimits.defaultTimeoutMs / 1000,
  maxAuthorChars: runtimeLimits.maxFrontMatterValueChars
});

const defaultAuthor = "Archi Agent";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function problem(code: SettingsProblemCode, key: string, message: string): SettingsProblem {
  return Object.freeze({ code, setting: `archiAgent.${key}`, message });
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;

    if (code < 32 || (code >= 127 && code <= 159)) {
      return true;
    }
  }

  return false;
}

function explicitProfile(reader: SettingsReader): { readonly explicit: false } | { readonly explicit: true; readonly value: unknown } {
  const value = reader.inspect(settingKeys.localModelProfile)?.globalValue;
  return value === undefined ? { explicit: false } : { explicit: true, value };
}

function selectedModel(reader: SettingsReader, profile: ReturnType<typeof explicitProfile>): { readonly key: string; readonly value: unknown } {
  if (!profile.explicit) {
    return { key: settingKeys.localModelId, value: reader.get(settingKeys.localModelId) };
  }

  if (typeof profile.value !== "string") {
    return { key: settingKeys.localModelSelectedModel, value: undefined };
  }

  const binding = reader.inspect(settingKeys.localModelSelectedModelProfile)?.globalValue;

  return {
    key: settingKeys.localModelSelectedModel,
    value:
      binding === profile.value && defaultBaseUrlForLocalProfile(binding) !== undefined
        ? reader.inspect(settingKeys.localModelSelectedModel)?.globalValue
        : undefined
  };
}

export function readLocalModelSettings(reader: SettingsReader): LocalModelSettingsResult {
  const problems: SettingsProblem[] = [];
  const profile = explicitProfile(reader);
  const selectedProfileId = profile.explicit ? profile.value : localLmStudioProfileId;
  const profileDefaultBaseUrl = typeof selectedProfileId === "string" ? defaultBaseUrlForLocalProfile(selectedProfileId) : undefined;

  if (profile.explicit && profileDefaultBaseUrl === undefined) {
    problems.push(problem("unknown-provider-profile", settingKeys.localModelProfile, "The explicitly configured provider profile is not registered."));
  }

  const effectiveProfileId = typeof selectedProfileId === "string" ? selectedProfileId : "";
  const baseUrlDefault = profile.explicit ? profileDefaultBaseUrl : defaultLocalModelBaseUrl;
  const rawBaseUrl = effectiveProfileId === localLmStudioProfileId ? reader.get(settingKeys.localModelBaseUrl) : undefined;
  const baseUrlText = text(rawBaseUrl) === "" ? (baseUrlDefault ?? "") : text(rawBaseUrl);
  const endpoint = baseUrlDefault === undefined ? undefined : parseLoopbackEndpoint(baseUrlText);

  if (endpoint !== undefined && !endpoint.ok) {
    problems.push(
      problem(
        "local-model-base-url-invalid",
        settingKeys.localModelBaseUrl,
        `The local model base URL was rejected (${endpoint.code}). Use a literal loopback URL such as ${defaultLocalModelBaseUrl}.`
      )
    );
  }

  const model = selectedModel(reader, profile);
  const modelText = text(model.value);
  let modelId: string | undefined;

  if (modelText !== "") {
    if (isSafeModelId(modelText)) {
      modelId = modelText;
    } else {
      problems.push(problem("local-model-id-invalid", model.key, "The model identifier is not a safe model identifier."));
    }
  }

  const rawTimeout = reader.get(settingKeys.localModelTimeoutSeconds);
  const timeoutSeconds = rawTimeout === undefined || rawTimeout === null ? settingsLimits.defaultTimeoutSeconds : rawTimeout;

  if (
    typeof timeoutSeconds !== "number" ||
    !Number.isFinite(timeoutSeconds) ||
    timeoutSeconds < settingsLimits.minTimeoutSeconds ||
    timeoutSeconds > settingsLimits.maxTimeoutSeconds
  ) {
    problems.push(
      problem(
        "local-model-timeout-invalid",
        settingKeys.localModelTimeoutSeconds,
        `The timeout must be between ${settingsLimits.minTimeoutSeconds} and ${settingsLimits.maxTimeoutSeconds} seconds.`
      )
    );
  }

  if (problems.length > 0 || endpoint === undefined || !endpoint.ok || typeof timeoutSeconds !== "number") {
    return Object.freeze({ ok: false, problems: Object.freeze(problems) });
  }

  return Object.freeze({
    ok: true,
    settings: Object.freeze({
      selectionMode: profile.explicit ? "profile" : "legacy",
      profileId: effectiveProfileId,
      baseUrl: endpoint.endpoint.baseUrl,
      modelId,
      timeoutMs: Math.round(timeoutSeconds * 1000)
    })
  });
}

export function readArchiAgentSettings(reader: SettingsReader): SettingsResult {
  const problems: SettingsProblem[] = [];
  const knowledgePackPath = text(reader.get(settingKeys.knowledgePackPath));

  if (knowledgePackPath === "") {
    problems.push(
      problem("knowledge-pack-path-missing", settingKeys.knowledgePackPath, "Set the absolute path of the Architecture Knowledge Pack directory.")
    );
  } else if (!path.isAbsolute(knowledgePackPath) || hasControlCharacter(knowledgePackPath)) {
    problems.push(
      problem("knowledge-pack-path-not-absolute", settingKeys.knowledgePackPath, "The Knowledge Pack path must be an absolute directory path.")
    );
  }

  const localModel = readLocalModelSettings(reader);

  if (!localModel.ok) {
    problems.push(...localModel.problems);
  }

  const rawAuthor = reader.get(settingKeys.defaultAuthor);
  const author = text(rawAuthor) === "" ? defaultAuthor : text(rawAuthor);

  if (hasControlCharacter(author) || author.length > settingsLimits.maxAuthorChars) {
    problems.push(problem("default-author-invalid", settingKeys.defaultAuthor, "The default author is too long or contains a control character."));
  }

  if (problems.length > 0 || !localModel.ok) {
    return Object.freeze({ ok: false, problems: Object.freeze(problems) });
  }

  return Object.freeze({
    ok: true,
    settings: Object.freeze({ knowledgePackPath, localModel: localModel.settings, defaultAuthor: author })
  });
}
