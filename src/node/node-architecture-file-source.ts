import { canonicalDirectory } from "./local-file-path.js";
import { readBoundedTextFile } from "./bounded-file-reader.js";
import { validateRelativePath, throwIfCancelled, type KnowledgePackSource, type ReadTextFileOptions, type ListFilesOptions } from "../core/knowledge-pack/knowledge-pack-source.js";
/** One explicitly configured directory; no recursive discovery or implicit model includes. */
export class NodeArchitectureFileSource implements KnowledgePackSource {
  private constructor(private readonly root: string, private readonly files: readonly string[]) {}
  static async open(directory: string, files: readonly string[]) {
    if (files.some(f => !validateRelativePath(f).ok)) throw new Error("invalid-path");
    return new NodeArchitectureFileSource(await canonicalDirectory(directory), [...files]);
  }
  async listFiles(options?: ListFilesOptions) { throwIfCancelled(options?.signal); return this.files; }
  async readTextFile(file: string, options?: ReadTextFileOptions) {
    if (!this.files.includes(file)) throw new Error("invalid-path");
    throwIfCancelled(options?.signal);
    const result = await readBoundedTextFile(this.root, file, { maxBytes: Math.min(options?.maxBytes ?? 1024 * 1024, 1024 * 1024), ...(options?.signal ? { signal: options.signal } : {}) });
    throwIfCancelled(options?.signal); return result.text;
  }
}
