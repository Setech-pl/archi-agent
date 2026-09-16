import { stableCompare } from "./ordering.js";

/**
 * Deterministic canonical serialization and SHA-256 for the framework-independent core.
 *
 * The SHA-256 implementation follows FIPS 180-4 and runs synchronously on typed arrays, so the core
 * needs neither the Node crypto module nor the asynchronous Web Crypto API. Canonical serialization
 * sorts object keys by UTF-16 code units, keeps array order, and rejects values that JSON cannot
 * represent unambiguously instead of dropping or coercing them.
 */

export type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalValue[]
  | { readonly [key: string]: CanonicalValue };

const maxCanonicalDepth = 64;

export function canonicalSerialize(value: CanonicalValue): string {
  return serialize(value, 0, new Set<object>());
}

function serialize(value: unknown, depth: number, ancestors: Set<object>): string {
  if (depth > maxCanonicalDepth) {
    throw new Error("Canonical value is nested too deeply.");
  }

  if (value === null) {
    return "null";
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Canonical numbers must be finite.");
    }

    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value !== "object") {
    throw new Error("Value cannot be serialized canonically.");
  }

  if (ancestors.has(value)) {
    throw new Error("Canonical value contains a cycle.");
  }

  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      return "[" + Array.from(value, (item: unknown) => serialize(item, depth + 1, ancestors)).join(",") + "]";
    }

    const prototype: unknown = Object.getPrototypeOf(value);

    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error("Only plain objects can be serialized canonically.");
    }

    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .sort(stableCompare)
      .map((key) => JSON.stringify(key) + ":" + serialize(record[key], depth + 1, ancestors));

    return "{" + entries.join(",") + "}";
  } finally {
    ancestors.delete(value);
  }
}

/** UTF-8 encoding; unpaired surrogates become U+FFFD, as in the platform encoders. */
export function utf8Encode(text: string): Uint8Array {
  const bytes: number[] = [];

  for (let index = 0; index < text.length; index += 1) {
    let codePoint = text.charCodeAt(index);

    if (codePoint >= 0xd800 && codePoint <= 0xdbff) {
      const next = index + 1 < text.length ? text.charCodeAt(index + 1) : 0;

      if (next >= 0xdc00 && next <= 0xdfff) {
        codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + (next - 0xdc00);
        index += 1;
      } else {
        codePoint = 0xfffd;
      }
    } else if (codePoint >= 0xdc00 && codePoint <= 0xdfff) {
      codePoint = 0xfffd;
    }

    if (codePoint < 0x80) {
      bytes.push(codePoint);
    } else if (codePoint < 0x800) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint < 0x10000) {
      bytes.push(0xe0 | (codePoint >> 12), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f));
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f)
      );
    }
  }

  return Uint8Array.from(bytes);
}

const roundConstants = Uint32Array.from([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

const initialHash = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

/** SHA-256 (FIPS 180-4) of a byte sequence. */
export function sha256(bytes: Uint8Array): Uint8Array {
  const length = bytes.length;
  const paddedLength = Math.ceil((length + 9) / 64) * 64;
  const data = new Uint8Array(paddedLength);
  data.set(bytes);
  data[length] = 0x80;
  const view = new DataView(data.buffer);
  const bitLength = length * 8;
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(paddedLength - 4, bitLength >>> 0);

  const hash = Uint32Array.from(initialHash);
  const words = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4);
    }

    for (let index = 16; index < 64; index += 1) {
      const w15 = words[index - 15] ?? 0;
      const w2 = words[index - 2] ?? 0;
      const s0 = rotateRight(w15, 7) ^ rotateRight(w15, 18) ^ (w15 >>> 3);
      const s1 = rotateRight(w2, 17) ^ rotateRight(w2, 19) ^ (w2 >>> 10);
      words[index] = ((words[index - 16] ?? 0) + s0 + (words[index - 7] ?? 0) + s1) >>> 0;
    }

    let a = hash[0] ?? 0;
    let b = hash[1] ?? 0;
    let c = hash[2] ?? 0;
    let d = hash[3] ?? 0;
    let e = hash[4] ?? 0;
    let f = hash[5] ?? 0;
    let g = hash[6] ?? 0;
    let h = hash[7] ?? 0;

    for (let index = 0; index < 64; index += 1) {
      const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + choice + (roundConstants[index] ?? 0) + (words[index] ?? 0)) >>> 0;
      const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    hash[0] = (hash[0] ?? 0) + a;
    hash[1] = (hash[1] ?? 0) + b;
    hash[2] = (hash[2] ?? 0) + c;
    hash[3] = (hash[3] ?? 0) + d;
    hash[4] = (hash[4] ?? 0) + e;
    hash[5] = (hash[5] ?? 0) + f;
    hash[6] = (hash[6] ?? 0) + g;
    hash[7] = (hash[7] ?? 0) + h;
  }

  const output = new Uint8Array(32);
  const outputView = new DataView(output.buffer);

  for (let index = 0; index < 8; index += 1) {
    outputView.setUint32(index * 4, hash[index] ?? 0);
  }

  return output;
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Lower-case hexadecimal SHA-256 of the UTF-8 encoding of a text. */
export function sha256Hex(text: string): string {
  return toHex(sha256(utf8Encode(text)));
}

/** SHA-256 of the canonical serialization of a value. */
export function stableDigest(value: CanonicalValue): string {
  return sha256Hex(canonicalSerialize(value));
}

export function isSha256Hex(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}
