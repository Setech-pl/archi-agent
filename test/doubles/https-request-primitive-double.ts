import { EventEmitter } from "node:events";
import type { ClientRequest, IncomingMessage } from "node:http";
import type { RequestOptions } from "node:https";
import type { HttpsRequestPrimitive } from "../../src/node/llm/remote-json-transport.js";

export interface HttpsResponsePlan {
  readonly statusCode?: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly chunks?: readonly Buffer[];
  readonly complete?: boolean;
  readonly requestError?: string;
  readonly responseError?: boolean;
  readonly aborted?: boolean;
  readonly noResponse?: boolean;
}

export interface HttpsRequestCall {
  readonly options: RequestOptions;
  body?: Buffer;
  readonly request: ClientRequestDouble;
}

export class ClientRequestDouble extends EventEmitter {
  public destroyedByClient = false;
  readonly #onEnd: (body: Buffer | undefined) => void;

  public constructor(onEnd: (body: Buffer | undefined) => void) {
    super();
    this.#onEnd = onEnd;
  }

  public end(body?: string | Uint8Array): this {
    this.#onEnd(body === undefined ? undefined : Buffer.from(body));
    return this;
  }

  public destroy(): this {
    this.destroyedByClient = true;
    return this;
  }
}

export class HttpsRequestPrimitiveDouble {
  public readonly calls: HttpsRequestCall[] = [];
  readonly #plans: HttpsResponsePlan[];

  public constructor(...plans: HttpsResponsePlan[]) {
    this.#plans = [...plans];
  }

  public readonly request: HttpsRequestPrimitive = (options, callback) => {
    const plan = this.#plans.shift() ?? {};
    let call: HttpsRequestCall;
    const request = new ClientRequestDouble((body) => {
      call.body = body;
      queueMicrotask(() => this.#respond(plan, request, callback));
    });
    call = { options, request };
    this.calls.push(call);
    return request as unknown as ClientRequest;
  };

  #respond(plan: HttpsResponsePlan, request: ClientRequestDouble, callback: (response: IncomingMessage) => void): void {
    if (request.destroyedByClient || plan.noResponse === true) return;
    if (plan.requestError !== undefined) {
      request.emit("error", Object.assign(new Error("synthetic request failure"), { code: plan.requestError }));
      return;
    }

    const response = new EventEmitter() as EventEmitter & {
      statusCode: number;
      headers: Readonly<Record<string, string>>;
      complete: boolean;
    };
    response.statusCode = plan.statusCode ?? 200;
    response.headers = plan.headers ?? { "content-type": "application/json" };
    response.complete = plan.complete ?? true;
    callback(response as unknown as IncomingMessage);

    if (plan.aborted === true) {
      response.emit("aborted");
      return;
    }
    if (plan.responseError === true) {
      response.emit("error", new Error("synthetic response failure"));
      return;
    }
    for (const chunk of plan.chunks ?? [Buffer.from("{}", "utf8")]) response.emit("data", chunk);
    response.emit("end");
  }
}
