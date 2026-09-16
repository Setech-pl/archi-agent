/**
 * Endpoint policy for local OpenAI-compatible model servers such as LM Studio.
 *
 * Only a literal numeric loopback base URL is accepted: http://127.0.0.1:<port>/v1 or
 * http://[::1]:<port>/v1 (a single trailing slash is normalized away). Host names (including
 * localhost), other addresses, https and every other scheme, credentials, query strings, fragments,
 * percent-encoding, backslashes, non-ASCII characters, missing or invalid ports and any other path are
 * rejected before a connection is attempted. The raw text is checked first and the platform URL
 * parser confirms the result. Only the models and chat completions paths are ever built.
 */

export const defaultLocalModelBaseUrl = "http://127.0.0.1:1234/v1";

export const loopbackEndpointCodes = [
  "invalid-url",
  "unsupported-scheme",
  "credentials-not-allowed",
  "query-not-allowed",
  "fragment-not-allowed",
  "non-loopback-host",
  "invalid-port",
  "unexpected-path"
] as const;

export type LoopbackEndpointCode = (typeof loopbackEndpointCodes)[number];

export interface LoopbackEndpoint {
  /** Normalized base URL, for example http://127.0.0.1:1234/v1. */
  readonly baseUrl: string;
  /** Literal address used for the connection; never resolved through DNS. */
  readonly hostname: "127.0.0.1" | "::1";
  readonly port: number;
  readonly modelsPath: "/v1/models";
  readonly chatCompletionsPath: "/v1/chat/completions";
}

export type LoopbackEndpointResult =
  | { readonly ok: true; readonly endpoint: LoopbackEndpoint }
  | { readonly ok: false; readonly code: LoopbackEndpointCode };

const maxUrlChars = 256;
const schemePattern = /^([A-Za-z][A-Za-z0-9+.-]*):/;
const authorityPattern = /^(127\.0\.0\.1|\[::1\])(?::(.*))?$/;
const portPattern = /^[1-9][0-9]{0,4}$/;

function reject(code: LoopbackEndpointCode): LoopbackEndpointResult {
  return Object.freeze({ ok: false, code });
}

export function parseLoopbackEndpoint(input: unknown): LoopbackEndpointResult {
  if (typeof input !== "string" || input.length === 0 || input.length > maxUrlChars) {
    return reject("invalid-url");
  }

  for (const character of input) {
    const code = character.codePointAt(0) ?? 0;

    if (code < 33 || code > 126 || character === "\\" || character === "%") {
      return reject("invalid-url");
    }
  }

  const scheme = schemePattern.exec(input);

  if (scheme === null) {
    return reject("invalid-url");
  }

  if (scheme[1] !== "http") {
    return reject("unsupported-scheme");
  }

  if (!input.startsWith("http://")) {
    return reject("invalid-url");
  }

  const rest = input.slice("http://".length);

  if (rest.includes("@")) {
    return reject("credentials-not-allowed");
  }

  if (rest.includes("?")) {
    return reject("query-not-allowed");
  }

  if (rest.includes("#")) {
    return reject("fragment-not-allowed");
  }

  const slash = rest.indexOf("/");
  const authority = slash === -1 ? rest : rest.slice(0, slash);
  const pathPart = slash === -1 ? "" : rest.slice(slash);
  const host = authorityPattern.exec(authority);

  if (host === null) {
    return reject("non-loopback-host");
  }

  const hostLiteral = host[1] ?? "";
  const portText = host[2];

  if (portText === undefined || !portPattern.test(portText) || Number(portText) > 65_535) {
    return reject("invalid-port");
  }

  if (pathPart !== "/v1" && pathPart !== "/v1/") {
    return reject("unexpected-path");
  }

  let url: URL;

  try {
    url = new URL(input);
  } catch {
    return reject("invalid-url");
  }

  if (
    url.protocol !== "http:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    url.hostname !== hostLiteral ||
    url.port !== portText ||
    (url.pathname !== "/v1" && url.pathname !== "/v1/")
  ) {
    return reject("invalid-url");
  }

  const port = Number(portText);
  return Object.freeze({
    ok: true,
    endpoint: Object.freeze({
      baseUrl: `http://${hostLiteral}:${port}/v1`,
      hostname: hostLiteral === "[::1]" ? "::1" : "127.0.0.1",
      port,
      modelsPath: "/v1/models",
      chatCompletionsPath: "/v1/chat/completions"
    })
  });
}
