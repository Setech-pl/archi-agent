import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  canonicalSerialize,
  isSha256Hex,
  sha256,
  sha256Hex,
  stableDigest,
  toHex,
  utf8Encode,
  type CanonicalValue
} from "../../../src/core/util/stable-digest.js";

const platformSha256 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");
const accented = String.fromCodePoint(0x0142, 0x0105, 0x0107);
const astral = String.fromCodePoint(0x1f680);
const loneSurrogate = String.fromCharCode(0xd800) + "lone";

describe("sha256", () => {
  it("matches the FIPS 180-4 test vectors", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"
    );
    expect(sha256Hex("a".repeat(1_000_000))).toBe("cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0");
  });

  it("matches the platform implementation across padding boundaries and Unicode", () => {
    for (const length of [1, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1000, 4097]) {
      const text = "x".repeat(length);
      expect(sha256Hex(text)).toBe(platformSha256(text));
    }

    for (const text of [accented, astral, `Mission ${accented} Control ${astral}`, loneSurrogate]) {
      expect(sha256Hex(text)).toBe(platformSha256(text));
    }
  });

  it("encodes UTF-8 like the platform, including unpaired surrogates", () => {
    for (const text of ["", "plain", accented, astral, loneSurrogate, String.fromCharCode(0xdc00)]) {
      expect([...utf8Encode(text)]).toEqual([...Buffer.from(text, "utf8")]);
    }
  });

  it("returns 32 bytes and lower-case hexadecimal text", () => {
    const bytes = sha256(utf8Encode("abc"));
    expect(bytes).toHaveLength(32);
    expect(toHex(bytes)).toBe(sha256Hex("abc"));
    expect(isSha256Hex(sha256Hex("abc"))).toBe(true);
    expect(isSha256Hex(sha256Hex("abc").toUpperCase())).toBe(false);
    expect(isSha256Hex("abc")).toBe(false);
  });
});

describe("canonicalSerialize", () => {
  it("sorts object keys, keeps array order and normalizes negative zero", () => {
    expect(canonicalSerialize({ b: 1, a: [3, 1, 2], c: { z: null, y: true } })).toBe('{"a":[3,1,2],"b":1,"c":{"y":true,"z":null}}');
    expect(canonicalSerialize(-0)).toBe("0");
    expect(canonicalSerialize(`Orbit ${accented}`)).toBe(JSON.stringify(`Orbit ${accented}`));
    expect(canonicalSerialize([])).toBe("[]");
  });

  it("rejects values without one unambiguous representation", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic["self"] = cyclic;
    let deep: unknown = "leaf";

    for (let level = 0; level < 70; level += 1) {
      deep = [deep];
    }

    for (const value of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      { a: undefined },
      () => 1,
      new Date(0),
      new Map([["a", 1]]),
      new Array(3),
      cyclic,
      deep
    ]) {
      expect(() => canonicalSerialize(value as unknown as CanonicalValue)).toThrow();
    }
  });

  it("gives the same digest for the same content in any key order and a new one for new content", () => {
    const first = { participants: ["a", "b"], metadata: { name: "x", language: "en" } };
    const second = { metadata: { language: "en", name: "x" }, participants: ["a", "b"] };

    expect(stableDigest(first)).toBe(stableDigest(second));
    expect(stableDigest(first)).toBe(platformSha256(canonicalSerialize(first)));
    expect(isSha256Hex(stableDigest(first))).toBe(true);
    expect(stableDigest({ ...first, participants: ["b", "a"] })).not.toBe(stableDigest(first));
    expect(stableDigest({ ...first, metadata: { name: "y", language: "en" } })).not.toBe(stableDigest(first));
  });
});
