import type { RemoteJsonRequest, RemoteJsonTransport } from "../../src/node/llm/remote-json-transport.js";

export class RemoteJsonTransportDouble implements RemoteJsonTransport {
  public readonly requests: RemoteJsonRequest[] = [];
  readonly #responses: (string | Error)[];

  public constructor(...responses: (string | Error)[]) {
    this.#responses = [...responses];
  }

  public exchange(request: RemoteJsonRequest): Promise<string> {
    this.requests.push(request);
    const response = this.#responses.shift();
    if (response instanceof Error) return Promise.reject(response);
    if (response === undefined) return Promise.reject(new Error("missing synthetic response"));
    return Promise.resolve(response);
  }
}
