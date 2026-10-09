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
  readonly modal?: boolean;
}

export interface RecordedShownDocument {
  readonly document: DoubleDocument;
  readonly options: unknown;
}

type QuickPickAnswer = (items: readonly unknown[], options: unknown) => unknown;

export interface DoubleState {
  workspaceFolders: { name: string; uri: DoubleUri; index: number }[] | undefined;
  configuration: Map<string, unknown>;
  configurationInspect: Map<
    string,
    { defaultValue?: unknown; globalValue?: unknown; workspaceValue?: unknown; workspaceFolderValue?: unknown }
  >;
  configurationUpdateFailures: Set<string>;
  /** One-based update call numbers that reject before mutating configuration. */
  configurationUpdateFailureCalls: Set<number>;
  configurationUpdateHook?: (key: string, value: unknown, target: unknown) => void;
  configurationUpdates: { key: string; value: unknown; target: unknown }[];
  secrets: Map<string, string>;
  secretReads: string[];
  secretWrites: { key: string; value: string }[];
  secretDeletes: string[];
  secretFailures: Set<"get" | "store" | "delete">;
  quickPickAnswers: QuickPickAnswer[];
  quickPicks: { items: readonly unknown[]; options: unknown }[];
  inputBoxAnswers: (string | undefined)[];
  inputBoxes: unknown[];
  inputBoxHook?: (options: unknown, call: number) => void;
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
  progressCancelOnStart: boolean;
  cancelProgress?: () => void;
  untitledCounter: number;
}

function freshState(): DoubleState {
  return {
    workspaceFolders: undefined,
    configuration: new Map(),
    configurationInspect: new Map(),
    configurationUpdateFailures: new Set(),
    configurationUpdateFailureCalls: new Set(),
    configurationUpdateHook: undefined,
    configurationUpdates: [],
    secrets: new Map(),
    secretReads: [],
    secretWrites: [],
    secretDeletes: [],
    secretFailures: new Set(),
    quickPickAnswers: [],
    quickPicks: [],
    inputBoxAnswers: [],
    inputBoxes: [],
    inputBoxHook: undefined,
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
    progressCancelOnStart: false,
    untitledCounter: 0
  };
}

export const state: DoubleState = freshState();

export function resetDouble(): void {
  panels.splice(0).forEach((p) => p.dispose());
  webviewDrivers.splice(0); configListeners.clear(); folderListeners.clear();
  Object.assign(state, freshState());
}

function uriFromPath(fsPath: string, scheme = "file"): DoubleUri {
  return Object.freeze({ scheme, fsPath, path: fsPath.split("\\").join("/"), toString: () => scheme + ":" + fsPath });
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

function record(level: RecordedMessage["level"], text: string, actions: readonly string[], modal?: boolean): Promise<string | undefined> {
  state.messages.push(Object.freeze({ level, text, actions: Object.freeze([...actions]), ...(modal === undefined ? {} : { modal }) }));
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
    state.inputBoxHook?.(options, state.inputBoxes.length);
    return Promise.resolve(state.inputBoxAnswers.shift());
  },
  showOpenDialog(): Promise<DoubleUri[] | undefined> {
    return Promise.resolve(state.openDialogAnswers.shift());
  },
  showErrorMessage(text: string, ...actions: string[]): Promise<string | undefined> {
    return record("error", text, actions);
  },
  showWarningMessage(text: string, ...actions: (string | { modal?: boolean })[]): Promise<string | undefined> {
    return record("warning", text, actions.filter((action): action is string => typeof action === "string"),
      actions.some((action) => typeof action === "object" && action.modal === true) ? true : undefined);
  },
  showInformationMessage(text: string, ...actions: string[]): Promise<string | undefined> {
    return record("info", text, actions);
  },
  withProgress<T>(options: { title?: string }, task: (progress: { report(): void }, token: unknown) => Thenable<T>): Thenable<T> {
    state.progressTitles.push(options.title ?? "");
    const listeners = new Set<() => void>();
    const token = { isCancellationRequested: state.progressCancelOnStart, onCancellationRequested: (listener: () => void) => {
      listeners.add(listener);
      if (state.progressCancelOnStart) queueMicrotask(listener);
      return { dispose: () => { listeners.delete(listener); } };
    } };
    state.cancelProgress = () => { token.isCancellationRequested = true; for (const listener of listeners) listener(); };
    return Promise.resolve(task({ report: () => undefined }, token)).finally(() => { state.cancelProgress = undefined; });
  },
  showTextDocument(document: DoubleDocument, options?: unknown): Promise<{ document: DoubleDocument }> {
    state.shownDocuments.push({ document, options });
    return Promise.resolve({ document });
  }
};

export const workspace = {
  get workspaceFolders() { return state.workspaceFolders; },
  getConfiguration(section: string, resource?: DoubleUri) {
    const fullKey = (key: string): string => `${section}.${key}`;
    const folderKey = (key: string): string => `${section}.${key}@${resource?.fsPath ?? ""}`;
    const effectiveValue = (key: string): unknown => {
      const inspected = resource === undefined ? state.configurationInspect.get(fullKey(key)) : state.configurationInspect.get(folderKey(key));
      const global = state.configurationInspect.get(fullKey(key));

      if (inspected !== undefined) {
        return inspected.workspaceFolderValue ?? inspected.workspaceValue ?? global?.workspaceValue ?? global?.globalValue ?? global?.defaultValue;
      }

      return global?.workspaceValue ?? global?.globalValue ?? state.configuration.get(fullKey(key));
    };

    return {
      get: (key: string): unknown => effectiveValue(key),
      inspect: (key: string) => {
        const inspected = resource === undefined ? state.configurationInspect.get(fullKey(key)) : state.configurationInspect.get(folderKey(key));
        const global = state.configurationInspect.get(fullKey(key));
        return inspected === undefined
          ? Object.freeze({ ...global, globalValue: global?.globalValue ?? state.configuration.get(fullKey(key)) })
          : Object.freeze({ ...inspected, globalValue: global?.globalValue ?? state.configuration.get(fullKey(key)) });
      },
      update: (key: string, value: unknown, target: unknown): Promise<void> => {
        const qualified = fullKey(key);
        state.configurationUpdates.push({ key: qualified, value, target });
        state.configurationUpdateHook?.(qualified, value, target);

        if (state.configurationUpdateFailures.has(qualified) || state.configurationUpdateFailureCalls.has(state.configurationUpdates.length)) {
          return Promise.reject(new Error("synthetic configuration update failure"));
        }

        const inspected = state.configurationInspect.get(target === ConfigurationTarget.WorkspaceFolder && resource !== undefined ? folderKey(key) : qualified) ?? {};

        if (target === ConfigurationTarget.Global) {
          const next = { ...inspected };

          if (value === undefined) {
            delete next.globalValue;
          } else {
            next.globalValue = value;
          }

          state.configurationInspect.set(qualified, next);
        }

        if (target === ConfigurationTarget.WorkspaceFolder && resource !== undefined) {
          const next = { ...inspected };
          if (value === undefined) delete next.workspaceFolderValue;
          else next.workspaceFolderValue = value;
          state.configurationInspect.set(folderKey(key), next);
          return Promise.resolve();
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
    const handler = state.registeredCommands.get(command);
    return handler === undefined ? Promise.resolve(undefined) : Promise.resolve(handler(...args));
  }
};

export const secretStorage = {
  get(key: string): Promise<string | undefined> {
    state.secretReads.push(key);
    if (state.secretFailures.has("get")) return Promise.reject(new Error("synthetic secret read failure"));
    return Promise.resolve(state.secrets.get(key));
  },
  store(key: string, value: string): Promise<void> {
    if (state.secretFailures.has("store")) return Promise.reject(new Error("synthetic secret write failure"));
    state.secretWrites.push({ key, value });
    state.secrets.set(key, value);
    return Promise.resolve();
  },
  delete(key: string): Promise<void> {
    if (state.secretFailures.has("delete")) return Promise.reject(new Error("synthetic secret delete failure"));
    state.secretDeletes.push(key);
    state.secrets.delete(key);
    return Promise.resolve();
  },
  onDidChange: () => new Disposable()
};

/** Minimal extension context: subscriptions and SecretStorage used by the extension. */
export function createExtensionContext(): { subscriptions: { dispose(): unknown }[]; secrets: typeof secretStorage } {
  return { subscriptions: [], secrets: secretStorage };
}

export interface DoublePanel {
  viewType: string;
  title: string;
  options: unknown;
  revealed: number;
  disposed: boolean;
  webview: { html: string; messages: any[]; postMessage(value: unknown): Promise<boolean>; onDidReceiveMessage(fn: (v: unknown) => unknown): Disposable };
  receive(value: unknown): Promise<void>;
  reveal(): void;
  onDidDispose(fn: () => void): Disposable;
  dispose(): void;
}
export const panels: DoublePanel[] = [];
export const webviewDrivers: ((panel: DoublePanel, state: any) => unknown)[] = [];
const configListeners = new Set<(event: {affectsConfiguration(s: string): boolean}) => void>();
const folderListeners = new Set<() => void>();
export function configurationChanged(): void { configListeners.forEach((fn) => fn({ affectsConfiguration: () => true })); }
export function workspaceChanged(): void { folderListeners.forEach((fn) => fn()); }
Object.assign(workspace, {
  isTrusted: true,
  onDidChangeConfiguration: (fn: any) => { configListeners.add(fn); return new Disposable(() => configListeners.delete(fn)); },
  onDidChangeWorkspaceFolders: (fn: any) => { folderListeners.add(fn); return new Disposable(() => folderListeners.delete(fn)); }
});
Object.assign(window, {
  createWebviewPanel: (viewType: string, title: string, _column: unknown, options: unknown) => {
    const listeners = new Set<(v: unknown) => unknown>(), disposeListeners = new Set<() => void>();
    const driver = webviewDrivers.shift();
    const panel: DoublePanel = { viewType, title, options, revealed: 0, disposed: false,
      webview: { html: "", messages: [], postMessage: async (v: any) => {
        panel.webview.messages.push(v);
        if (v.type === "state" && !v.busy && driver) queueMicrotask(() => { void driver(panel,v); });
        return true;
      }, onDidReceiveMessage: (fn) => { listeners.add(fn); return new Disposable(() => listeners.delete(fn)); } },
      receive: async (value) => { for (const fn of listeners) await fn(value); },
      reveal: () => { panel.revealed++; },
      onDidDispose: (fn) => { disposeListeners.add(fn); return new Disposable(() => disposeListeners.delete(fn)); },
      dispose: () => { if (panel.disposed) return; panel.disposed = true; [...disposeListeners].forEach((fn) => fn()); }
    };
    panels.push(panel);
    queueMicrotask(() => { void panel.receive({ op: "ready", revision: 0 }); });
    return panel;
  }
});
