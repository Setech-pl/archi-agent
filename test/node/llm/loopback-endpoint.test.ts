import { describe, expect, it } from "vitest";
import { defaultLocalModelBaseUrl, parseLoopbackEndpoint, type LoopbackEndpointCode } from "../../../src/node/llm/loopback-endpoint.js";

// Addresses and host names are assembled at run time, so this file contains no literal address or
// domain other than the loopback forms under test.
const ip = (...parts: number[]): string => parts.join(".");
const host = (...labels: string[]): string => labels.join(".");

function codeOf(input: unknown): LoopbackEndpointCode | "ok" {
  const result = parseLoopbackEndpoint(input);
  return result.ok ? "ok" : result.code;
}

describe("parseLoopbackEndpoint - accepted", () => {
  it("accepts the default IPv4 loopback base URL", () => {
    const result = parseLoopbackEndpoint(defaultLocalModelBaseUrl);

    expect(defaultLocalModelBaseUrl).toBe("http://127.0.0.1:1234/v1");
    expect(result).toEqual({
      ok: true,
      endpoint: {
        baseUrl: "http://127.0.0.1:1234/v1",
        hostname: "127.0.0.1",
        port: 1234,
        modelsPath: "/v1/models",
        chatCompletionsPath: "/v1/chat/completions"
      }
    });
    expect(Object.isFrozen(result.ok && result.endpoint)).toBe(true);
  });

  it("accepts the IPv6 loopback literal", () => {
    const result = parseLoopbackEndpoint("http://[::1]:1234/v1");

    expect(result.ok && [result.endpoint.baseUrl, result.endpoint.hostname, result.endpoint.port]).toEqual(["http://[::1]:1234/v1", "::1", 1234]);
  });

  it("normalizes one trailing slash and accepts the full port range", () => {
    const normalized = parseLoopbackEndpoint("http://127.0.0.1:1234/v1/");

    expect(normalized.ok && normalized.endpoint.baseUrl).toBe("http://127.0.0.1:1234/v1");
    expect(codeOf("http://127.0.0.1:1/v1")).toBe("ok");
    expect(codeOf("http://127.0.0.1:65535/v1")).toBe("ok");
  });
});

describe("parseLoopbackEndpoint - rejected", () => {
  const cases: ReadonlyArray<readonly [string, unknown, LoopbackEndpointCode]> = [
    ["localhost", "http://localhost:1234/v1", "non-loopback-host"],
    ["upper-case localhost", "http://LOCALHOST:1234/v1", "non-loopback-host"],
    ["a DNS name", `http://${host("models", "sample", "net")}:1234/v1`, "non-loopback-host"],
    ["a private class C address", `http://${ip(192, 168, 1, 10)}:1234/v1`, "non-loopback-host"],
    ["a private class A address", `http://${ip(10, 0, 0, 5)}:1234/v1`, "non-loopback-host"],
    ["a private class B address", `http://${ip(172, 16, 0, 1)}:1234/v1`, "non-loopback-host"],
    ["another loopback-range address", `http://${ip(127, 0, 0, 2)}:1234/v1`, "non-loopback-host"],
    ["the unspecified address", "http://0.0.0.0:1234/v1", "non-loopback-host"],
    ["a shortened loopback address", "http://127.1:1234/v1", "non-loopback-host"],
    ["a decimal address", "http://2130706433:1234/v1", "non-loopback-host"],
    ["a hexadecimal address", "http://0x7f.0.0.1:1234/v1", "non-loopback-host"],
    ["an expanded IPv6 loopback", "http://[0:0:0:0:0:0:0:1]:1234/v1", "non-loopback-host"],
    ["an IPv4-mapped IPv6 address", "http://[::ffff:127.0.0.1]:1234/v1", "non-loopback-host"],
    ["an internet host over https", `https://${host("api", "sample", "com")}/v1`, "unsupported-scheme"],
    ["https to loopback", "https://127.0.0.1:1234/v1", "unsupported-scheme"],
    ["an upper-case scheme", "HTTP://127.0.0.1:1234/v1", "unsupported-scheme"],
    ["a file URL", "file:///v1", "unsupported-scheme"],
    ["a websocket URL", "ws://127.0.0.1:1234/v1", "unsupported-scheme"],
    ["credentials", "http://user:pass@127.0.0.1:1234/v1", "credentials-not-allowed"],
    ["a user name only", "http://user@127.0.0.1:1234/v1", "credentials-not-allowed"],
    ["a host after credentials", `http://127.0.0.1:1234@${host("evil", "sample", "com")}/v1`, "credentials-not-allowed"],
    ["a query string", "http://127.0.0.1:1234/v1?key=value", "query-not-allowed"],
    ["a fragment", "http://127.0.0.1:1234/v1#models", "fragment-not-allowed"],
    ["a missing port", "http://127.0.0.1/v1", "invalid-port"],
    ["an empty port", "http://127.0.0.1:/v1", "invalid-port"],
    ["port zero", "http://127.0.0.1:0/v1", "invalid-port"],
    ["a port above the range", "http://127.0.0.1:65536/v1", "invalid-port"],
    ["a port with a leading zero", "http://127.0.0.1:01234/v1", "invalid-port"],
    ["a non-numeric port", "http://127.0.0.1:port/v1", "invalid-port"],
    ["no path", "http://127.0.0.1:1234", "unexpected-path"],
    ["the root path", "http://127.0.0.1:1234/", "unexpected-path"],
    ["another version", "http://127.0.0.1:1234/v2", "unexpected-path"],
    ["a longer path", "http://127.0.0.1:1234/v1/models", "unexpected-path"],
    ["a doubled slash", "http://127.0.0.1:1234/v1//", "unexpected-path"],
    ["an upper-case path", "http://127.0.0.1:1234/V1", "unexpected-path"],
    ["a parent segment", "http://127.0.0.1:1234/v1/../admin", "unexpected-path"],
    ["a percent-encoded host", `http://%31%32%37${".0.0.1"}:1234/v1`, "invalid-url"],
    ["a percent-encoded path", "http://127.0.0.1:1234/v1%2F", "invalid-url"],
    ["backslashes", "http:\\\\127.0.0.1:1234\\v1", "invalid-url"],
    ["surrounding whitespace", " http://127.0.0.1:1234/v1", "invalid-url"],
    ["a line separator", `http://127.0.0.1:1234/v1${String.fromCharCode(0x2028)}`, "invalid-url"],
    ["no scheme", "127.0.0.1:1234/v1", "invalid-url"],
    ["an empty string", "", "invalid-url"],
    ["an oversized string", `http://127.0.0.1:1234/v1${"a".repeat(300)}`, "invalid-url"],
    ["a non-string value", 1234, "invalid-url"]
  ];

  it.each(cases)("rejects %s", (_name, input, code) => {
    const result = parseLoopbackEndpoint(input);

    expect(result).toEqual({ ok: false, code });
    expect(Object.isFrozen(result)).toBe(true);
  });
});
