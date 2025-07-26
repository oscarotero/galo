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

/** Parameters for Error routes */
interface ErrorParams extends Params {
  error: Error;
}

/** Handler function type */
type Handler<D = Data> = (
  params: HttpParams & D,
) => HandlerReturn | Promise<HandlerReturn>;
type HandlerReturn =
  | Response
  | string
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
type WebSocketHandler<D = Data> = (
  params: WebSocketParams & D,
) => void | Promise<void>;

interface Defaults {
  method?: Method;
}

export default class Router {
  routes: Route<unknown>[] = [];
  defaults: Defaults;
  defaultHandler?: Handler<any>;
  errorHandler?: Handler<any>;

  constructor(defaults: Defaults = {}) {
    this.fetch = this.fetch.bind(this);
    this.defaults = defaults;
  }

  /** Add a handler for a path */
  path<D = Data>(pattern: string, handler: Handler<D>): this {
    return this.#add(handler, "HTTP", this.defaults.method, pattern);
  }

  /** Set a default handler for unmatched routes */
  default<D = Data>(handler: Handler<D>): this {
    this.defaultHandler = handler;
    return this;
  }

  /** Set an error handler for the router */
  /** This handler will be called when an error occurs in any route */
  catch(handler: Handler<ErrorParams>): this {
    this.errorHandler = handler;
    return this;
  }

  /** Add handlers for GET request */
  get<D = Data>(handler: Handler<D>): this;
  get<D = Data>(pattern: string | boolean, handler: Handler<D>): this;
  get<D = Data>(
    patternOrHandler: string | boolean | Handler<D>,
    handler?: Handler<D>,
  ): this {
    return this.#addMethod("GET", patternOrHandler, handler);
  }

  /** Add handlers for POST requests */
  post<D = Data>(handler: Handler<D>): this;
  post<D = Data>(pattern: string | boolean, handler: Handler<D>): this;
  post<D = Data>(
    patternOrHandler: string | boolean | Handler<D>,
    handler?: Handler<D>,
  ): this {
    return this.#addMethod("POST", patternOrHandler, handler);
  }

  /** Add handlers for PUT requests */
  put<D = Data>(handler: Handler<D>): this;
  put<D = Data>(pattern: string | boolean, handler: Handler<D>): this;
  put<D = Data>(
    patternOrHandler: string | boolean | Handler<D>,
    handler?: Handler<D>,
  ): this {
    return this.#addMethod("POST", patternOrHandler, handler);
  }

  /** Add handlers for DELETE requests */
  delete<D = Data>(handler: Handler<D>): this;
  delete<D = Data>(pattern: string | boolean, handler: Handler<D>): this;
  delete<D = Data>(
    patternOrHandler: string | boolean | Handler<D>,
    handler?: Handler<D>,
  ): this {
    return this.#addMethod("DELETE", patternOrHandler, handler);
  }

  /** Add a WebSocket handler */
  webSocket<D = Data>(handler: WebSocketHandler<D>): this;
  webSocket<D = Data>(pattern: string, handler: WebSocketHandler<D>): this;
  webSocket<D = Data>(
    patternOrHandler: string | WebSocketHandler<D>,
    handler?: WebSocketHandler<D>,
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
  #addMethod<D = Data>(
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

    const next = () => {
      return new Router({
        ...this.defaults,
        method: reqMethod,
      });
    };

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
          return await this.#runWebSocketHandler(handler as WebSocketHandler, {
            request,
            ...params,
          });
        }
        continue;
      }

      return await this.#runHandler(handler as Handler, {
        ...params,
        request,
        next,
      });
    }

    if (this.defaultHandler) {
      return await this.#runHandler(this.defaultHandler, {
        _: parts,
        request,
        next,
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
          return await this.#runHandler<ErrorParams>(this.errorHandler, {
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

    throw new Error(`Invalid handler return type, ${typeof handleReturn}`);
  }

  async #runWebSocketHandler(
    handler: WebSocketHandler,
    params: Params,
  ): Promise<Response> {
    const { request } = params;
    const { response, socket } = Deno.upgradeWebSocket(request);
    await (handler as WebSocketHandler)({ ...params, socket, response });
    return response;
  }

  /** Fetch method to handle incoming requests */
  fetch(request: Request): Promise<Response> {
    const parts = toParts(new URL(request.url).pathname);
    return this.#exec(parts, request);
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
): value is AsyncGeneratorFunction {
  return value !== null && typeof value === "object" &&
    typeof (value as any)[Symbol.asyncIterator] === "function";
}

function toError(err: unknown): Error {
  if (err instanceof Error) {
    return err;
  }
  return new Error(String(err));
}
