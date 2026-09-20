import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  isSafeModelId,
  isValidStructuredChatMaxTokens,
  safeErrorCode,
  structuredChatLimits
} from "../../../src/core/llm/structured-chat-client.js";

describe("structured chat contract", () => {
  it("accepts typical Ollama identifiers without widening the bounded ASCII policy", () => {
    for (const accepted of ["qwen3:8b", "gpt-oss:20b", "llama3.2", "hf.co/unsloth/Qwen3-Coder-30B-A3B-Instruct-1M-GGUF:Q4_K_M"]) {
      expect(isSafeModelId(accepted)).toBe(true);
    }

    for (const rejected of ["a".repeat(129), "model..tag", "owner//model", "model tag", "model\ttag", "model\r\ntag", "model\\tag", `model${String.fromCharCode(7)}tag`, "model\r\nAuthorization: injected"]) {
      expect(isSafeModelId(rejected)).toBe(false);
    }
  });

  it("accepts only integer maxTokens values in the inclusive 1..16384 range", () => {
    expect(structuredChatLimits).toEqual({ minMaxTokens: 1, maxMaxTokens: 16_384 });

    for (const accepted of [1, 2, 16_383, 16_384]) {
      expect(isValidStructuredChatMaxTokens(accepted)).toBe(true);
    }

    for (const rejected of [0, -1, 16_385, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, "1", null]) {
      expect(isValidStructuredChatMaxTokens(rejected)).toBe(false);
    }
  });

  it("returns only codes matching the exact safe pattern", () => {
    for (const code of ["a", "0", "-", "timeout", "reasoning-content-not-a-json-object", "a".repeat(64)]) {
      expect(safeErrorCode({ code })).toBe(code);
    }

    for (const code of ["", "A", "bad_code", "bad code", "bad.code", "a".repeat(65), 42, null, undefined]) {
      expect(safeErrorCode({ code })).toBeUndefined();
    }

    expect(safeErrorCode(null)).toBeUndefined();
    expect(safeErrorCode("timeout")).toBeUndefined();
    expect(safeErrorCode(new Error("private message"))).toBeUndefined();
  });

  it("does not expose other error data and cannot throw for hostile unknown input", () => {
    const hostile = Object.defineProperty({}, "code", {
      get(): never {
        throw new Error("private getter text");
      }
    });
    const coded = Object.assign(new Error("private message"), { code: "timeout", stack: "private stack" });

    expect(() => safeErrorCode(hostile)).not.toThrow();
    expect(safeErrorCode(hostile)).toBeUndefined();
    expect(safeErrorCode(coded)).toBe("timeout");
    expect(JSON.stringify(safeErrorCode(coded))).not.toContain("private");
  });

  it("keeps the core contract free of Node and VS Code imports and provider assumptions", () => {
    const source = readFileSync(new URL("../../../src/core/llm/structured-chat-client.ts", import.meta.url), "utf8");

    expect(source).not.toMatch(/from ["']node:/);
    expect(source).not.toMatch(/from ["']vscode["']/);
    for (const forbidden of ["LM Studio", "localhost", "loopback", "node:http", "SecretStorage", "/v1/chat/completions"]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
