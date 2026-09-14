import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // The editor module exists only inside the extension host. Unit tests of
      // the editor layer resolve it to an in-memory double instead.
      vscode: path.join(projectRoot, "test", "doubles", "vscode-module-double.ts")
    }
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    globals: false
  }
});
