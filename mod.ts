// deno-lint-ignore-file no-explicit-any

/** Supported methods and protocols */
type Method = "GET" | "POST" | "PUT" | "DELETE";
type Protocol = "HTTP" | "WS";

/** Router is a tupple with [handler, protocol, method?, path?] */
type Route<D> = [
  Handler<D> | WebSocketHandler<D>,
  Protocol,
  Method | undefined,
  string[] | undefined,
];

interface Params {
  _: string[];
  request: Request;
  [key: string]: any; // Allow additional parameters
}

type Data = Record<string, any>;

/** Parameters common to all routes */
interface HttpParams extends Params {
  next: () => Router;
}

/** Parameters for WebSocket routes */
interface WebSocketParams extends Params {
  socket: WebSocket;
  response: Response;
}

/** Handler function type */
type Handler<D> = (
  params: D & HttpParams,
) => HandlerReturn | Promise<HandlerReturn>;
type HandlerReturn =
  | Response
  | string
  | object
  | Array<unknown>
  | Router
  | Uint8Array
  | ReadableStream
  | Blob
  | ArrayBuffer
  | URLSearchParams
  | FormData
  | DataView
  | File
  | AsyncGenerator<string | Uint8Array, void, unknown>;

/** WebSocket handler function type */
type WebSocketHandler<D> = (
  params: WebSocketParams & D,
) => void | Promise<void>;

export default class Router<D extends Data = Data> {
  routes: Route<unknown>[] = [];
  params: D;
  defaultHandler?: Handler<any>;
  errorHandler?: Handler<any>;
  next: <T>(params?: T) => Router<D & T>;
  fetch: (request: Request) => Promise<Response>;

  constructor(params?: D) {
    this.params = params || {} as D;
    this.next = <T>(params?: T) =>
      new Router<D & T>({ ...this.params, ...params } as D & T);
    this.fetch = (request: Request) =>
      this.#exec(toParts(new URL(request.url).pathname), request);
  }

  /** Add a handler for a path */
  path<T>(pattern: string, handler: Handler<T & D>): this {
    return this.#add(handler, "HTTP", undefined, pattern);
  }

  /** Set a default handler for unmatched routes */
  default<T>(handler: Handler<T & D>): this {
    this.defaultHandler = handler;
    return this;
  }

  /** Set an error handler for the router */
  /** This handler will be called when an error occurs in any route */
  catch<T>(handler: Handler<T & D & { error: Error }>): this {
    this.errorHandler = handler;
    return this;
  }

  /** Add handlers for GET request */
  get<T>(handler: Handler<T & D>): this;
  get<T>(pattern: string | boolean, handler: Handler<T & D>): this;
  get<T>(
    patternOrHandler: string | boolean | Handler<T & D>,
    handler?: Handler<T & D>,
  ): this {
    return this.#addMethod("GET", patternOrHandler, handler);
  }

  /** Add handlers for POST requests */
  post<T>(handler: Handler<T & D>): this;
  post<T>(pattern: string | boolean, handler: Handler<T & D>): this;
  post<T>(
    patternOrHandler: string | boolean | Handler<T & D>,
    handler?: Handler<T & D>,
  ): this {
    return this.#addMethod("POST", patternOrHandler, handler);
  }

  /** Add handlers for PUT requests */
  put<T>(handler: Handler<T & D>): this;
  put<T>(pattern: string | boolean, handler: Handler<T & D>): this;
  put<T>(
    patternOrHandler: string | boolean | Handler<T & D>,
    handler?: Handler<T & D>,
  ): this {
    return this.#addMethod("POST", patternOrHandler, handler);
  }

  /** Add handlers for DELETE requests */
  delete<T>(handler: Handler<T & D>): this;
  delete<T>(pattern: string | boolean, handler: Handler<T & D>): this;
  delete<T>(
    patternOrHandler: string | boolean | Handler<T & D>,
    handler?: Handler<T & D>,
  ): this {
    return this.#addMethod("DELETE", patternOrHandler, handler);
  }

  /** Add a WebSocket handler */
  webSocket<T>(handler: WebSocketHandler<T & D>): this;
  webSocket<T>(pattern: string, handler: WebSocketHandler<T & D>): this;
  webSocket<T>(
    patternOrHandler: string | WebSocketHandler<T & D>,
    handler?: WebSocketHandler<T & D>,
  ): this {
    if (typeof patternOrHandler === "function") {
      return this.#add(patternOrHandler, "WS", "GET");
    }
    if (typeof handler === "function") {
      return this.#add(handler, "WS", "GET", patternOrHandler);
    }
    throw new Error("Handler must be a function");
  }

  /** Add handlers for any method requests */
  #addMethod<D>(
    method: Method,
    patternOrHandler: string | boolean | Handler<D>,
    handler?: Handler<D>,
  ): this {
    if (typeof patternOrHandler === "function") {
      return this.#add(patternOrHandler, "HTTP", method);
    }
    if (typeof handler === "function") {
      if (typeof patternOrHandler === "string") {
        return this.#add(handler, "HTTP", method, patternOrHandler);
      }
      if (patternOrHandler === true) {
        return this.#add(handler, "HTTP", method);
      }
      return this;
    }
    throw new Error("Handler must be a function");
  }

  #add(
    handler: Handler<any> | WebSocketHandler<any>,
    protocol: Protocol,
    method?: Method,
    pattern?: string,
  ): this {
    this.routes.push([
      handler,
      protocol,
      method,
      pattern ? toParts(pattern) : undefined,
    ]);

    return this;
  }

  async #exec(parts: string[], request: Request): Promise<Response> {
    const reqMethod = request.method as Method;

    for (const [handler, protocol, method, pattern] of this.routes) {
      if (method && reqMethod !== method) {
        continue;
      }

      const params = pattern ? matches(pattern, parts) : { _: parts };

      if (!params) {
        continue;
      }

      if (protocol === "WS") {
        if (isWebsocket(request)) {
          return await this.#runWebSocketHandler(
            handler as WebSocketHandler<D>,
            {
              ...this.params,
              ...params,
              request,
            },
          );
        }
        continue;
      }

      return await this.#runHandler(handler as Handler<D>, {
        ...this.params,
        ...params,
        request,
        next: this.next,
      });
    }

    if (this.defaultHandler) {
      return await this.#runHandler(this.defaultHandler, {
        ...this.params,
        request,
        _: parts,
        next: this.next,
      });
    }

    return new Response("Not Found", { status: 404 });
  }

  async #runHandler<D>(
    handler: Handler<D>,
    params: HttpParams & D,
  ): Promise<Response> {
    let handleReturn: HandlerReturn;
    try {
      handleReturn = await handler(params);
    } catch (err) {
      console.error(err);
      const error = toError(err);
      if (this.errorHandler) {
        try {
          return await this.#runHandler(this.errorHandler, {
            ...params,
            error,
          });
        } catch (err) {
          console.error(err);
          const error = toError(err);
          return new Response(error.toString(), { status: 500 });
        }
      }
      return new Response(error.toString(), { status: 500 });
    }

    // It's a nested Router
    if (handleReturn instanceof Router) {
      return handleReturn.#exec(params._, params.request);
    }

    // It's a Response
    if (handleReturn instanceof Response) {
      return handleReturn;
    }

    // It's a string => return an HTML response
    if (typeof handleReturn === "string") {
      return new Response(handleReturn, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // It's something that can be used as the body of a Response
    if (
      handleReturn instanceof Uint8Array ||
      handleReturn instanceof ReadableStream ||
      handleReturn instanceof Blob ||
      handleReturn instanceof ArrayBuffer ||
      handleReturn instanceof URLSearchParams ||
      handleReturn instanceof FormData ||
      handleReturn instanceof DataView
    ) {
      return new Response(handleReturn);
    }

    // It's a File
    if (handleReturn instanceof File) {
      return new Response(handleReturn.stream(), {
        status: 200,
        headers: {
          "Content-Type": handleReturn.type || "application/octet-stream",
          "Content-Length": handleReturn.size.toString(),
          "Content-Disposition": `attachment; filename="${handleReturn.name}"`,
        },
      });
    }

    // It's an async generator (stream)
    if (isAsyncGenerator(handleReturn)) {
      const textEncoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          for await (const chunk of handleReturn) {
            controller.enqueue(
              typeof chunk === "string" ? textEncoder.encode(chunk) : chunk,
            );
          }
          controller.close();
        },
        cancel() {
          handleReturn.return?.();
        },
      });
      return new Response(stream);
    }

    // It's an object or array => return a JSON response
    if (typeof handleReturn === "object" || Array.isArray(handleReturn)) {
      return Response.json(handleReturn);
    }

    throw new Error(`Invalid handler return type, ${typeof handleReturn}`);
  }

  async #runWebSocketHandler<D>(
    handler: WebSocketHandler<D>,
    params: Params & D,
  ): Promise<Response> {
    const { request } = params;
    const { response, socket } = Deno.upgradeWebSocket(request);
    await handler({ ...this.params, ...params, socket, response });
    return response;
  }
}

/**
 * Convert a path to an array of directories
 * For example, "/foo/bar" becomes ["foo", "bar"]
 */
function toParts(pattern: string): string[] {
  return pattern.split("/").filter((part) => part.length > 0);
}

/** Match a pattern with an array of directories */
function matches(pattern: string[], parts: string[]): Params | false {
  const captures: Record<string, string> = {};
  const hasWildcard = pattern[pattern.length - 1] === "*";

  if (hasWildcard) {
    pattern = pattern.slice(0, -1);

    if (pattern.length > parts.length) {
      return false;
    }
  } else if (pattern.length !== parts.length) {
    return false;
  }

  for (let i = 0; i < pattern.length; i++) {
    const part = pattern[i];
    const value = parts[i];

    if (part.startsWith(":")) {
      captures[part.slice(1)] = decodeURIComponent(value);
    } else if (part !== value) {
      return false;
    }
  }

  return {
    ...captures,
    _: parts.slice(pattern.length),
  } as Params;
}

/** Check if a request is a websocket */
function isWebsocket(request: Request): boolean {
  return (request.method === "GET" &&
    request.headers.get("upgrade")?.toLowerCase() === "websocket");
}

/** Check if a function is an async generator */
function isAsyncGenerator(
  value: unknown,
): value is AsyncGenerator<string | Uint8Array, void, unknown> {
  return value !== null && typeof value === "object" &&
    typeof (value as any)[Symbol.asyncIterator] === "function";
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}
