import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import path from "node:path";
import { ConversionFailure, conversionLimits } from "../../core/document-conversion/contract.js";

/** Read at most inputBytes + 1 from one regular local file; never follow the final symlink. */
export async function readDocument(filePath: string): Promise<Buffer> {
  if (!path.isAbsolute(filePath)) {
    throw new ConversionFailure("non-local-source");
  }

  let handle;
  try {
    const initial = await lstat(filePath);
    if (!initial.isFile()) {
      throw new ConversionFailure("not-a-file");
    }
    if (initial.size > conversionLimits.inputBytes) {
      throw new ConversionFailure("input-too-large");
    }

    handle = await open(filePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const opened = await handle.stat();
    if (!opened.isFile()) {
      throw new ConversionFailure("not-a-file");
    }
    if (opened.size > conversionLimits.inputBytes) {
      throw new ConversionFailure("input-too-large");
    }

    const bytes = Buffer.allocUnsafe(conversionLimits.inputBytes + 1);
    let used = 0;
    while (used < bytes.length) {
      const { bytesRead } = await handle.read(bytes, used, bytes.length - used, used);
      if (bytesRead === 0) break;
      used += bytesRead;
    }
    if (used > conversionLimits.inputBytes) {
      throw new ConversionFailure("input-too-large");
    }
    return bytes.subarray(0, used);
  } catch (error) {
    if (error instanceof ConversionFailure) throw error;
    throw new ConversionFailure("read-failed");
  } finally {
    await handle?.close().catch(() => undefined);
  }
}
