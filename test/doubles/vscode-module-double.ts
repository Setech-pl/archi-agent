/**
 * In-memory double of the "vscode" module for unit tests of the editor layer. The vitest config
 * aliases "vscode" to this file. It implements only the members the extension uses, records every
 * interaction and answers prompts from scripted queues. It performs no I/O.
 */

export interface DoubleDocument {
  readonly languageId: string;
  readonly isUntitled: boolean;
  readonly fileName: string;
  readonly uri: DoubleUri;
  getText(): string;
}

export interface DoubleUri {
  readonly scheme: string;
  readonly fsPath: string;
  readonly path: string;
}

export interface RecordedMessage {
  readonly level: "error" | "warning" | "info";
  readonly text: string;
  readonly actions: readonly string[];
}

export interface RecordedShownDocument {
  readonly document: DoubleDocument;
  readonly options: unknown;
}

type QuickPickAnswer = (items: readonly unknown[], options: unknown) => unknown;

export interface DoubleState {
  configuration: Map<string, unknown>;
  configurationInspect: Map<
    string,
    { defaultValue?: unknown; globalValue?: unknown; workspaceValue?: unknown; workspaceFolderValue?: unknown }
  >;
  configurationUpdateFailures: Set<string>;
  /** One-based update call numbers that reject before mutating configuration. */
  configurationUpdateFailureCalls: Set<number>;
  configurationUpdates: { key: string; value: unknown; target: unknown }[];
  quickPickAnswers: QuickPickAnswer[];
  quickPicks: { items: readonly unknown[]; options: unknown }[];
  inputBoxAnswers: (string | undefined)[];
  inputBoxes: unknown[];
  openDialogAnswers: (DoubleUri[] | undefined)[];
  messageAnswers: (string | undefined)[];
  messages: RecordedMessage[];
  openedDocuments: DoubleDocument[];
  shownDocuments: RecordedShownDocument[];
  outputLines: string[];
  outputShown: boolean;
  registeredCommands: Map<string, (...args: unknown[]) => unknown>;
  executedCommands: { command: string; args: unknown[] }[];
  activeTextEditor: { document: DoubleDocument } | undefined;
  languages: string[];
  progressTitles: string[];
  untitledCounter: number;
}

function freshState(): DoubleState {
  return {
    configuration: new Map(),
    configurationInspect: new Map(),
    configurationUpdateFailures: new Set(),
    configurationUpdateFailureCalls: new Set(),
    configurationUpdates: [],
    quickPickAnswers: [],
    quickPicks: [],
    inputBoxAnswers: [],
    inputBoxes: [],
    openDialogAnswers: [],
    messageAnswers: [],
    messages: [],
    openedDocuments: [],
    shownDocuments: [],
    outputLines: [],
    outputShown: false,
    registeredCommands: new Map(),
    executedCommands: [],
    activeTextEditor: undefined,
    languages: ["plaintext", "json", "markdown"],
    progressTitles: [],
    untitledCounter: 0
  };
}

export const state: DoubleState = freshState();

export function resetDouble(): void {
  Object.assign(state, freshState());
}

function uriFromPath(fsPath: string, scheme = "file"): DoubleUri {
  return Object.freeze({ scheme, fsPath, path: fsPath.split("\\").join("/") });
}

export function makeDocument(text: string, options: { fileName?: string; languageId?: string } = {}): DoubleDocument {
  const fileName = options.fileName;
  return Object.freeze({
    languageId: options.languageId ?? "markdown",
    isUntitled: fileName === undefined,
    fileName: fileName ?? "Untitled-1",
    uri: uriFromPath(fileName ?? "untitled:Untitled-1", fileName === undefined ? "untitled" : "file"),
    getText: () => text
  });
}

function record(level: RecordedMessage["level"], text: string, actions: readonly string[]): Promise<string | undefined> {
  state.messages.push(Object.freeze({ level, text, actions: Object.freeze([...actions]) }));
  return Promise.resolve(state.messageAnswers.shift());
}

class Disposable {
  readonly #dispose: () => void;

  public constructor(dispose: () => void = () => undefined) {
    this.#dispose = dispose;
  }

  public dispose(): void {
    this.#dispose();
  }
}

export const ConfigurationTarget = Object.freeze({ Global: 1, Workspace: 2, WorkspaceFolder: 3 });
export const ViewColumn = Object.freeze({ Active: -1, Beside: -2, One: 1, Two: 2 });
export const ProgressLocation = Object.freeze({ SourceControl: 1, Window: 10, Notification: 15 });

export const Uri = Object.freeze({
  file: (fsPath: string): DoubleUri => uriFromPath(fsPath),
  parse: (value: string): DoubleUri => uriFromPath(value, value.split(":")[0] ?? "file")
});

export const window = {
  get activeTextEditor(): { document: DoubleDocument } | undefined {
    return state.activeTextEditor;
  },
  createOutputChannel(name: string) {
    return {
      name,
      append: (value: string) => {
        state.outputLines.push(value);
      },
      appendLine: (value: string) => {
        state.outputLines.push(value);
      },
      replace: () => undefined,
      clear: () => undefined,
      show: () => {
        state.outputShown = true;
      },
      hide: () => undefined,
      dispose: () => undefined
    };
  },
  showQuickPick(items: readonly unknown[] | Promise<readonly unknown[]>, options: unknown): Promise<unknown> {
    return Promise.resolve(items).then((resolved) => {
      state.quickPicks.push({ items: resolved, options });
      const answer = state.quickPickAnswers.shift();
      return answer === undefined ? undefined : answer(resolved, options);
    });
  },
  showInputBox(options: unknown): Promise<string | undefined> {
    state.inputBoxes.push(options);
    return Promise.resolve(state.inputBoxAnswers.shift());
  },
  showOpenDialog(): Promise<DoubleUri[] | undefined> {
    return Promise.resolve(state.openDialogAnswers.shift());
  },
  showErrorMessage(text: string, ...actions: string[]): Promise<string | undefined> {
    return record("error", text, actions);
  },
  showWarningMessage(text: string, ...actions: string[]): Promise<string | undefined> {
    return record("warning", text, actions);
  },
  showInformationMessage(text: string, ...actions: string[]): Promise<string | undefined> {
    return record("info", text, actions);
  },
  withProgress<T>(options: { title?: string }, task: (progress: { report(): void }, token: unknown) => Thenable<T>): Thenable<T> {
    state.progressTitles.push(options.title ?? "");
    const token = { isCancellationRequested: false, onCancellationRequested: () => new Disposable() };
    return task({ report: () => undefined }, token);
  },
  showTextDocument(document: DoubleDocument, options?: unknown): Promise<{ document: DoubleDocument }> {
    state.shownDocuments.push({ document, options });
    return Promise.resolve({ document });
  }
};

export const workspace = {
  getConfiguration(section: string) {
    const fullKey = (key: string): string => `${section}.${key}`;
    const effectiveValue = (key: string): unknown => {
      const inspected = state.configurationInspect.get(fullKey(key));

      if (inspected !== undefined) {
        return inspected.workspaceFolderValue ?? inspected.workspaceValue ?? inspected.globalValue ?? inspected.defaultValue;
      }

      return state.configuration.get(fullKey(key));
    };

    return {
      get: (key: string): unknown => effectiveValue(key),
      inspect: (key: string) => {
        const inspected = state.configurationInspect.get(fullKey(key));
        return inspected === undefined
          ? { globalValue: state.configuration.get(fullKey(key)) }
          : Object.freeze({ ...inspected });
      },
      update: (key: string, value: unknown, target: unknown): Promise<void> => {
        const qualified = fullKey(key);
        state.configurationUpdates.push({ key: qualified, value, target });

        if (state.configurationUpdateFailures.has(qualified) || state.configurationUpdateFailureCalls.has(state.configurationUpdates.length)) {
          return Promise.reject(new Error("synthetic configuration update failure"));
        }

        const inspected = state.configurationInspect.get(qualified) ?? {};

        if (target === ConfigurationTarget.Global) {
          const next = { ...inspected };

          if (value === undefined) {
            delete next.globalValue;
          } else {
            next.globalValue = value;
          }

          state.configurationInspect.set(qualified, next);
        }

        if (value === undefined) {
          state.configuration.delete(qualified);
        } else {
          state.configuration.set(qualified, value);
        }
        return Promise.resolve();
      }
    };
  },
  openTextDocument(target: { language?: string; content?: string } | DoubleUri): Promise<DoubleDocument> {
    if ("content" in target || "language" in target) {
      state.untitledCounter += 1;
      const document = Object.freeze({
        languageId: target.language ?? "plaintext",
        isUntitled: true,
        fileName: `Untitled-${state.untitledCounter}`,
        uri: uriFromPath(`untitled:Untitled-${state.untitledCounter}`, "untitled"),
        getText: () => target.content ?? ""
      });
      state.openedDocuments.push(document);
      return Promise.resolve(document);
    }

    return Promise.reject(new Error("The double opens in-memory documents only."));
  }
};

export const languages = {
  getLanguages(): Promise<string[]> {
    return Promise.resolve([...state.languages]);
  }
};

export const commands = {
  registerCommand(command: string, handler: (...args: unknown[]) => unknown): Disposable {
    state.registeredCommands.set(command, handler);
    return new Disposable(() => {
      state.registeredCommands.delete(command);
    });
  },
  executeCommand(command: string, ...args: unknown[]): Promise<unknown> {
    state.executedCommands.push({ command, args });
    return Promise.resolve(undefined);
  }
};

/** Minimal extension context: only the subscriptions the extension pushes into. */
export function createExtensionContext(): { subscriptions: { dispose(): unknown }[] } {
  return { subscriptions: [] };
}
