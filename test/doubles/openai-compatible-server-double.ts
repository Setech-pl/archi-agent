import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Loopback OpenAI-compatible server double for tests. It binds only to 127.0.0.1 on an ephemeral
 * port, answers GET /v1/models and POST /v1/chat/completions according to a deterministic scenario,
 * captures bounded request metadata for assertions (never printed) and destroys every connection on
 * shutdown. It makes no outgoing connection.
 */

export const serverDoubleScenarios = [
  "completion",
  "invalid-envelope",
  "multiple-choices",
  "malformed-json",
  "schema-invalid",
  "semantic-invalid",
  "oversized",
  "timeout",
  "http-error",
  "redirect",
  "wrong-content-type"
] as const;

export type ServerDoubleScenario = (typeof serverDoubleScenarios)[number];

/** Fixed message contents for the scenarios that return a well-formed envelope with bad content. */
export const scenarioContents = Object.freeze({
  "malformed-json": '{"participants": [}',
  "schema-invalid": JSON.stringify({ participants: [], messages: [], notes: "free text" }),
  "semantic-invalid": JSON.stringify({
    participants: [{ origin: "knowledge-pack", elementId: "ground-segment", canonicalName: "Ground Segment", kind: "system" }],
    messages: [{ from: { elementId: "ground-segment" }, to: { elementId: "ground-segment" }, label: "Check the uplink", interfaceType: "INTERNAL", order: 1 }]
  })
});

const maxCapturedBodyBytes = 2 * 1024 * 1024;
const maxHeaderValueChars = 200;

export interface CapturedRequest {
  readonly method: string;
  readonly path: string;
  /** Lower-case header names with bounded values. */
  readonly headers: Readonly<Record<string, string>>;
  readonly bodyBytes: number;
  /** Parsed JSON body, when the body was JSON. */
  readonly body: unknown;
}

export interface ServerDoubleOptions {
  readonly scenario?: ServerDoubleScenario;
  /** choices[0].message.content for the completion scenario. */
  readonly completionContent?: string;
  /** Entries of the model list: strings become { id }, other values are used as they are. */
  readonly models?: readonly unknown[];
  /** Raw body of the model list, replacing the generated one. */
  readonly modelsBody?: string;
}

export function completionEnvelope(content: string, choices = 1): string {
  return JSON.stringify({
    id: "completion-double",
    object: "chat.completion",
    created: 0,
    model: "double",
    choices: Array.from({ length: choices }, (_, index) => ({ index, message: { role: "assistant", content }, finish_reason: "stop" }))
  });
}

export class OpenAiCompatibleServerDouble {
  public readonly requests: CapturedRequest[] = [];
  public scenario: ServerDoubleScenario;
  public completionContent: string;
  public models: readonly unknown[];
  public modelsBody: string | undefined;
  readonly #server: Server;
  #port = 0;

  private constructor(options: ServerDoubleOptions) {
    this.scenario = options.scenario ?? "completion";
    this.completionContent = options.completionContent ?? "{}";
    this.models = options.models ?? [];
    this.modelsBody = options.modelsBody;
    this.#server = createServer((request, response) => this.#handle(request, response));
  }

  public static async start(options: ServerDoubleOptions = {}): Promise<OpenAiCompatibleServerDouble> {
    const double = new OpenAiCompatibleServerDouble(options);
    await new Promise<void>((resolve, reject) => {
      double.#server.once("error", reject);
      double.#server.listen(0, "127.0.0.1", () => resolve());
    });
    double.#port = (double.#server.address() as AddressInfo).port;
    return double;
  }

  public get port(): number {
    return this.#port;
  }

  public get baseUrl(): string {
    return `http://127.0.0.1:${this.#port}/v1`;
  }

  public completionRequests(): readonly CapturedRequest[] {
    return this.requests.filter((request) => request.path === "/v1/chat/completions");
  }

  public async close(): Promise<void> {
    this.#server.closeAllConnections();
    await new Promise<void>((resolve) => this.#server.close(() => resolve()));
  }

  #handle(request: IncomingMessage, response: ServerResponse): void {
    const chunks: Buffer[] = [];
    let size = 0;

    request.on("data", (chunk: Buffer) => {
      size += chunk.length;

      if (size <= maxCapturedBodyBytes) {
        chunks.push(chunk);
      }
    });
    request.on("end", () => {
      let body: unknown;

      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        body = undefined;
      }

      const headers = Object.fromEntries(
        Object.entries(request.headers).map(([name, value]) => [name.toLowerCase(), String(value).slice(0, maxHeaderValueChars)])
      );
      this.requests.push(Object.freeze({ method: request.method ?? "", path: request.url ?? "", headers, bodyBytes: size, body }));

      if (size > maxCapturedBodyBytes) {
        this.#send(response, 413, JSON.stringify({ error: { message: "too large" } }));
        return;
      }

      this.#respond(request.method ?? "", request.url ?? "", response);
    });
  }

  #send(response: ServerResponse, status: number, text: string, contentType = "application/json"): void {
    response.writeHead(status, { "Content-Type": contentType, "Content-Length": Buffer.byteLength(text) });
    response.end(text);
  }

  #respond(method: string, path: string, response: ServerResponse): void {
    if (this.scenario === "timeout") {
      return;
    }

    if (this.scenario === "redirect") {
      response.writeHead(307, { Location: "/v1/redirected" });
      response.end();
      return;
    }

    if (this.scenario === "http-error") {
      this.#send(response, 500, JSON.stringify({ error: { message: "synthetic failure" } }));
      return;
    }

    const contentType = this.scenario === "wrong-content-type" ? "text/plain; charset=utf-8" : "application/json";

    if (method === "GET" && path === "/v1/models") {
      const listing = this.models.map((entry) => (typeof entry === "string" ? { id: entry, object: "model" } : entry));
      this.#send(response, 200, this.modelsBody ?? JSON.stringify({ object: "list", data: listing }), contentType);
      return;
    }

    if (method === "POST" && path === "/v1/chat/completions") {
      switch (this.scenario) {
        case "invalid-envelope":
          this.#send(response, 200, JSON.stringify(["not", "an", "envelope"]));
          return;
        case "multiple-choices":
          this.#send(response, 200, completionEnvelope(this.completionContent, 2));
          return;
        case "oversized":
          this.#send(response, 200, completionEnvelope("x".repeat(1_200_000)));
          return;
        case "malformed-json":
        case "schema-invalid":
        case "semantic-invalid":
          this.#send(response, 200, completionEnvelope(scenarioContents[this.scenario]));
          return;
        default:
          this.#send(response, 200, completionEnvelope(this.completionContent), contentType);
          return;
      }
    }

    this.#send(response, 404, JSON.stringify({ error: { message: "not found" } }));
  }
}
