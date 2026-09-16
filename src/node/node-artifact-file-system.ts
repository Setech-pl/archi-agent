import { constants } from "node:fs";
import { copyFile, link, lstat, mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ArtifactFileSystemError,
  type ArtifactFileSystem,
  type ArtifactOutputCode
} from "../core/output/artifact-file-system.js";
import { stableCompare } from "../core/util/ordering.js";
import { canonicalDirectory, isInsideRoot, LocalPathError, relativeSegments, resolveContainedPath } from "./local-file-path.js";

/**
 * Node implementation of the artifact file-system port.
 *
 * All paths stay below the canonical output root and are resolved without following links;
 * a link or junction anywhere on the way is an error. Files are created exclusively, and a finished
 * temporary file receives its final name through a hard link (or an exclusive copy where hard links
 * are unsupported), so an existing destination is never replaced. Only regular files are removed.
 */

function errorCode(error: unknown): string {
  return error !== null && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "";
}

function fail(code: ArtifactOutputCode): never {
  throw new ArtifactFileSystemError(code);
}

function mapped(error: unknown, fallback: ArtifactOutputCode): ArtifactFileSystemError {
  if (error instanceof ArtifactFileSystemError) {
    return error;
  }

  if (error instanceof LocalPathError) {
    const specific: Partial<Record<LocalPathError["code"], ArtifactOutputCode>> = {
      "symbolic-link": "symbolic-link",
      "not-a-directory": "not-a-directory",
      "containment-violation": "containment-violation"
    };
    // An unsafe or missing path is reported with the code of the operation that received it.
    return new ArtifactFileSystemError(specific[error.code] ?? fallback);
  }

  return new ArtifactFileSystemError(fallback);
}

export class NodeArtifactFileSystem implements ArtifactFileSystem {
  readonly #root: string;

  private constructor(canonicalRoot: string) {
    this.#root = canonicalRoot;
  }

  /** Opens an existing output root directory that is not itself a link. */
  public static async open(outputRoot: string): Promise<NodeArtifactFileSystem> {
    try {
      return new NodeArtifactFileSystem(await canonicalDirectory(outputRoot));
    } catch (error) {
      throw mapped(error, "invalid-output-directory");
    }
  }

  async #resolve(relativePath: string, allowMissing: boolean) {
    try {
      return await resolveContainedPath(this.#root, relativePath, { allowMissing });
    } catch (error) {
      throw mapped(error, "containment-violation");
    }
  }

  /** Resolves a file path whose parent directory must already exist without links. */
  async #fileInExistingDirectory(relativePath: string): Promise<string> {
    const segments = (() => {
      try {
        return relativeSegments(relativePath);
      } catch (error) {
        throw mapped(error, "containment-violation");
      }
    })();

    if (segments.length > 1) {
      const parent = await this.#resolve(segments.slice(0, -1).join("/"), false);

      if (!parent.isDirectory) {
        fail("not-a-directory");
      }
    }

    const target = path.join(this.#root, ...segments);

    if (!isInsideRoot(this.#root, target)) {
      fail("containment-violation");
    }

    return target;
  }

  public async listDirectory(relativeDirectory: string): Promise<readonly string[]> {
    const resolved = await this.#resolve(relativeDirectory, true);

    if (!resolved.exists) {
      return Object.freeze([]);
    }

    if (!resolved.isDirectory) {
      fail("not-a-directory");
    }

    try {
      return Object.freeze((await readdir(resolved.absolutePath)).sort(stableCompare));
    } catch {
      fail("list-failed");
    }
  }

  public async ensureDirectory(relativeDirectory: string): Promise<void> {
    let segments: readonly string[];

    try {
      segments = relativeSegments(relativeDirectory);
    } catch (error) {
      throw mapped(error, "invalid-output-directory");
    }

    let current = this.#root;

    for (const segment of segments) {
      current = path.join(current, segment);

      if (!isInsideRoot(this.#root, current)) {
        fail("containment-violation");
      }

      let info;

      try {
        info = await lstat(current);
      } catch (error) {
        if (errorCode(error) !== "ENOENT") {
          fail("write-failed");
        }

        try {
          await mkdir(current);
        } catch (creation) {
          if (errorCode(creation) !== "EEXIST") {
            fail("write-failed");
          }
        }

        info = await lstat(current);
      }

      if (info.isSymbolicLink()) {
        fail("symbolic-link");
      }

      if (!info.isDirectory()) {
        fail("not-a-directory");
      }
    }
  }

  public async exists(relativePath: string): Promise<boolean> {
    return (await this.#resolve(relativePath, true)).exists;
  }

  public async writeNewFile(relativePath: string, content: string): Promise<void> {
    const target = await this.#fileInExistingDirectory(relativePath);

    try {
      await writeFile(target, content, { encoding: "utf8", flag: "wx" });
    } catch (error) {
      fail(errorCode(error) === "EEXIST" ? "destination-exists" : "write-failed");
    }
  }

  public async publishNewFile(temporaryRelativePath: string, finalRelativePath: string): Promise<void> {
    const source = await this.#resolve(temporaryRelativePath, false);

    if (!source.isFile) {
      fail("publish-failed");
    }

    const target = await this.#fileInExistingDirectory(finalRelativePath);

    try {
      await link(source.absolutePath, target);
      return;
    } catch (error) {
      const code = errorCode(error);

      if (code === "EEXIST") {
        fail("destination-exists");
      }

      if (!["EPERM", "ENOTSUP", "EXDEV", "ENOSYS", "EINVAL"].includes(code)) {
        fail("publish-failed");
      }
    }

    try {
      await copyFile(source.absolutePath, target, constants.COPYFILE_EXCL);
    } catch (error) {
      fail(errorCode(error) === "EEXIST" ? "destination-exists" : "publish-failed");
    }
  }

  public async removeFile(relativePath: string): Promise<void> {
    const resolved = await this.#resolve(relativePath, true);

    if (!resolved.exists) {
      return;
    }

    if (!resolved.isFile) {
      fail("cleanup-failed");
    }

    try {
      await unlink(resolved.absolutePath);
    } catch {
      fail("cleanup-failed");
    }
  }
}
