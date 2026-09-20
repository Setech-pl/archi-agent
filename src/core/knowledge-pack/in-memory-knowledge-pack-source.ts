import { utf8Encode } from "../util/stable-digest.js";
import {
  throwIfCancelled,
  validateRelativePath,
  type KnowledgePackSource,
  type ListFilesOptions,
  type ReadTextFileOptions
} from "./knowledge-pack-source.js";
import { createIssue, KnowledgePackError } from "./source-errors.js";
import { knowledgePackLimits } from "./source-limits.js";

/**
 * Knowledge-pack source backed by text held in memory. It follows the source port contract (safe
 * relative paths, byte limit before returning text, cancellation, typed errors without content)
 * and never touches a file system. The builder uses it to load rendered documents through the
 * regular loader before anything is written.
 */
export class InMemoryKnowledgePackSource implements KnowledgePackSource {
  readonly #files: ReadonlyMap<string, string>;

  public constructor(files: Iterable<readonly [string, string]>) {
    const map = new Map<string, string>();

    for (const [path, text] of files) {
      const check = validateRelativePath(path);

      if (!check.ok || map.has(path) || typeof text !== "string") {
        throw new Error("In-memory knowledge-pack files must have unique, safe relative paths and text content.");
      }

      map.set(path, text);
    }

    this.#files = map;
  }

  public async readTextFile(relativePath: string, options: ReadTextFileOptions = {}): Promise<string> {
    throwIfCancelled(options.signal);
    const check = validateRelativePath(relativePath);

    if (!check.ok) {
      throw new KnowledgePackError(check.issue);
    }

    const text = this.#files.get(check.path);

    if (text === undefined) {
      throw new KnowledgePackError(createIssue("missing-file", { file: check.path }));
    }

    const maxBytes = options.maxBytes ?? knowledgePackLimits.maxFileBytes;

    if (utf8Encode(text).length > maxBytes) {
      throw new KnowledgePackError(createIssue("limit-exceeded", { file: check.path, limit: maxBytes }));
    }

    return text;
  }

  public async listFiles(options: ListFilesOptions = {}): Promise<readonly string[]> {
    throwIfCancelled(options.signal);
    return Object.freeze([...this.#files.keys()]);
  }
}
