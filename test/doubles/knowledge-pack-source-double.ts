import {
  type KnowledgePackSource,
  type ListFilesOptions,
  type ReadTextFileOptions
} from "../../src/core/knowledge-pack/knowledge-pack-source.js";
import { createIssue, KnowledgePackError, type KnowledgePackErrorCode } from "../../src/core/knowledge-pack/source-errors.js";

export type ListingOrder = "as-given" | "reversed" | "sorted";

export interface SourceDoubleOptions {
  /** Result of listFiles(); defaults to the keys of the file map. */
  readonly listing?: readonly string[];
  readonly order?: ListingOrder;
  /** Value thrown by readTextFile for the given path. */
  readonly readFailures?: Readonly<Record<string, unknown>>;
  /** Value thrown by listFiles. */
  readonly listFailure?: unknown;
}

/** Builds a typed source error with a safe code, as a real adapter would. */
export function typedSourceError(code: KnowledgePackErrorCode, file?: string): KnowledgePackError {
  return new KnowledgePackError(createIssue(code, file === undefined ? {} : { file }));
}

/**
 * In-memory knowledge-pack source. It records every read and never logs content. A listed path
 * without content behaves like a file that disappeared before it was read.
 */
export class KnowledgePackSourceDouble implements KnowledgePackSource {
  readonly #files: ReadonlyMap<string, string>;
  readonly #options: SourceDoubleOptions;
  readonly #reads = new Map<string, number>();
  readonly #readOrder: string[] = [];
  readonly #readOptions = new Map<string, ReadTextFileOptions | undefined>();
  #listCalls = 0;

  public constructor(files: Readonly<Record<string, string>>, options: SourceDoubleOptions = {}) {
    this.#files = new Map(Object.entries(files));
    this.#options = options;
  }

  public async readTextFile(relativePath: string, options?: ReadTextFileOptions): Promise<string> {
    this.#reads.set(relativePath, (this.#reads.get(relativePath) ?? 0) + 1);
    this.#readOrder.push(relativePath);
    this.#readOptions.set(relativePath, options);

    if (options?.signal?.aborted === true) {
      throw typedSourceError("cancelled", relativePath);
    }

    const failures = this.#options.readFailures ?? {};

    if (Object.prototype.hasOwnProperty.call(failures, relativePath)) {
      throw failures[relativePath];
    }

    const content = this.#files.get(relativePath);

    if (content === undefined) {
      throw typedSourceError("missing-file", relativePath);
    }

    return content;
  }

  public async listFiles(options?: ListFilesOptions): Promise<readonly string[]> {
    this.#listCalls += 1;

    if (options?.signal?.aborted === true) {
      throw typedSourceError("cancelled");
    }

    if (this.#options.listFailure !== undefined) {
      throw this.#options.listFailure;
    }

    const listing = [...(this.#options.listing ?? [...this.#files.keys()])];
    const order = this.#options.order ?? "as-given";

    if (order === "reversed") {
      listing.reverse();
    } else if (order === "sorted") {
      listing.sort();
    }

    return Object.freeze(listing);
  }

  public get listCallCount(): number {
    return this.#listCalls;
  }

  public readCount(relativePath: string): number {
    return this.#reads.get(relativePath) ?? 0;
  }

  public wasRead(relativePath: string): boolean {
    return this.readCount(relativePath) > 0;
  }

  /** Paths in the order they were read. */
  public get readPaths(): readonly string[] {
    return Object.freeze([...this.#readOrder]);
  }

  public readOptionsFor(relativePath: string): ReadTextFileOptions | undefined {
    return this.#readOptions.get(relativePath);
  }
}
