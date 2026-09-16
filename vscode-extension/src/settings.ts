import path from "node:path";
import { defaultLocalModelBaseUrl, isSafeModelId, parseLoopbackEndpoint, runtimeLimits } from "../../src/runtime/index.js";
import { settingKeys } from "./contributions.js";

/**
 * Reads and checks the Archi Agent settings. The reader is the small part of the editor
 * configuration object this module needs, so the parsing is testable without the editor API.
 * Problems name the setting and carry a fixed message; they never echo the configured value.
 */

/** Structurally compatible with the editor's WorkspaceConfiguration.get(section). */
export interface SettingsReader {
  get(section: string): unknown;
}

export interface LocalModelSettings {
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

  const rawBaseUrl = reader.get(settingKeys.localModelBaseUrl);
  const baseUrlText = text(rawBaseUrl) === "" ? defaultLocalModelBaseUrl : text(rawBaseUrl);
  const endpoint = parseLoopbackEndpoint(baseUrlText);

  if (!endpoint.ok) {
    problems.push(
      problem(
        "local-model-base-url-invalid",
        settingKeys.localModelBaseUrl,
        `The local model base URL was rejected (${endpoint.code}). Use a literal loopback URL such as ${defaultLocalModelBaseUrl}.`
      )
    );
  }

  const rawModel = reader.get(settingKeys.localModelId);
  const modelText = text(rawModel);
  let modelId: string | undefined;

  if (modelText !== "") {
    if (isSafeModelId(modelText)) {
      modelId = modelText;
    } else {
      problems.push(problem("local-model-id-invalid", settingKeys.localModelId, "The model identifier is not a safe model identifier."));
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

  const rawAuthor = reader.get(settingKeys.defaultAuthor);
  const author = text(rawAuthor) === "" ? defaultAuthor : text(rawAuthor);

  if (hasControlCharacter(author) || author.length > settingsLimits.maxAuthorChars) {
    problems.push(problem("default-author-invalid", settingKeys.defaultAuthor, "The default author is too long or contains a control character."));
  }

  if (problems.length > 0 || !endpoint.ok || typeof timeoutSeconds !== "number") {
    return Object.freeze({ ok: false, problems: Object.freeze(problems) });
  }

  return Object.freeze({
    ok: true,
    settings: Object.freeze({
      knowledgePackPath,
      localModel: Object.freeze({ baseUrl: endpoint.endpoint.baseUrl, modelId, timeoutMs: Math.round(timeoutSeconds * 1000) }),
      defaultAuthor: author
    })
  });
}
