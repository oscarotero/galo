// deno-lint-ignore-file no-explicit-any
import { join } from "jsr:@std/path@1.1.1/join";
import { serveFile } from "jsr:@std/http@1.0.20/file-server";

/** Supported methods and protocols */
type Method = "GET" | "POST" | "PUT" | "DELETE" | "HEAD";
type Protocol = "HTTP" | "WS";

/** Router is a tupple with [handler, protocol, method?, path?] */
type RouteOrHandler = Handler<any> | Router<any>;

type Route = [
  RouteOrHandler,
  Protocol,
  Method | undefined,
  string | string[] | undefined,
];

type StaticRoute = [
  (request: Request, file: string) => Promise<Response> | Response,
  string[],
];

/** Parameters passed to routes */
interface Params<T extends Data = Data> {
  _: string[];
  request: Request;
  next: <D>(params?: D) => Router<T & D>;
  [key: string]: any; // Allow additional parameters
}

interface Data {
  request?: Request;
  [key: string]: any; // Allow additional parameters
}

/** Handler function type */
type Handler<D = Data, R = HandlerReturn> = (
  params: D & Params,
) => R | Promise<R>;

type HandlerReturn =
  | void
  | undefined
  | null
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

type HandlerOrRouter<T extends Data, R = HandlerReturn> =
  | Handler<T, R>
  | Router<T>;

export default class Router<D extends Data = Data> {
  routes: Route[] = [];
  staticRoutes: StaticRoute[] = [];
  params: D;
  defaultHandler?: HandlerOrRouter<any>;
  errorHandler?: Handler<any>;
  fetch: (request: Request) => Promise<Response>;

  constructor(params?: D) {
    this.params = params || {} as D;
    this.fetch = (request: Request) =>
      this.#runRouter(request, toParts(new URL(request.url).pathname));
  }

  response(): Promise<Response> {
    const { request } = this.params;
    if (!request) {
      throw new Error("No request available in the router");
    }
    return this.fetch(request);
  }

  /** Add a handler for a path */
  path<T>(pattern: string, handler: HandlerOrRouter<T & D>): this {
    return this.#add(handler, "HTTP", undefined, pattern);
  }

  /** Set a default handler for unmatched routes */
  default<T>(handler: HandlerOrRouter<T & D>): this {
    this.defaultHandler = handler;
    return this;
  }

  staticFiles(pattern: string, path: string): this {
    this.staticRoutes.push([
      async (request, file) => {
        return await serveFile(request, join(path, file));
      },
      toParts(pattern),
    ]);

    return this;
  }

  /** Set an error handler for the router */
  /** This handler will be called when an error occurs in any route */
  catch<T>(handler: Handler<T & D & { error: Error }>): this {
    this.errorHandler = handler;
    return this;
  }

  /** Add handlers for GET request */
  get<T>(handler: HandlerOrRouter<T & D>): this;
  get<T>(
    pattern: string | boolean,
    handler: HandlerOrRouter<T & D>,
  ): this;
  get<T>(
    patternOrHandler: string | boolean | HandlerOrRouter<T & D>,
    handler?: HandlerOrRouter<T & D>,
  ): this {
    return this.#addMethod("GET", "HTTP", patternOrHandler, handler);
  }

  /** Add handlers for POST requests */
  post<T>(handler: HandlerOrRouter<T & D>): this;
  post<T>(
    pattern: string | boolean,
    handler: HandlerOrRouter<T & D>,
  ): this;
  post<T>(
    patternOrHandler: string | boolean | HandlerOrRouter<T & D>,
    handler?: HandlerOrRouter<T & D>,
  ): this {
    return this.#addMethod("POST", "HTTP", patternOrHandler, handler);
  }

  /** Add handlers for PUT requests */
  put<T>(handler: HandlerOrRouter<T & D>): this;
  put<T>(
    pattern: string | boolean,
    handler: HandlerOrRouter<T & D>,
  ): this;
  put<T>(
    patternOrHandler: string | boolean | HandlerOrRouter<T & D>,
    handler?: HandlerOrRouter<T & D>,
  ): this {
    return this.#addMethod("PUT", "HTTP", patternOrHandler, handler);
  }

  /** Add handlers for DELETE requests */
  delete<T>(handler: HandlerOrRouter<T & D>): this;
  delete<T>(
    pattern: string | boolean,
    handler: HandlerOrRouter<T & D>,
  ): this;
  delete<T>(
    patternOrHandler: string | boolean | HandlerOrRouter<T & D>,
    handler?: HandlerOrRouter<T & D>,
  ): this {
    return this.#addMethod("DELETE", "HTTP", patternOrHandler, handler);
  }

  /** Add handlers for Web Socket requests */
  socket<T>(
    handler: HandlerOrRouter<
      T & D & { socket: WebSocket; response: Response },
      void | Response
    >,
  ): this;
  socket<T>(
    pattern: string | boolean,
    handler: HandlerOrRouter<
      T & D & { socket: WebSocket; response: Response },
      void | Response
    >,
  ): this;
  socket<T>(
    patternOrHandler: string | boolean | HandlerOrRouter<T & D>,
    handler?: HandlerOrRouter<
      T & D & { socket: WebSocket; response: Response },
      void | Response
    >,
  ): this {
    return this.#addMethod("GET", "WS", patternOrHandler, handler);
  }

  /** Add handlers for any method requests */
  #addMethod(
    method: Method,
    protocol: Protocol,
    patternOrHandler: string | boolean | HandlerOrRouter<any, any>,
    handler?: HandlerOrRouter<any, any>,
  ): this {
    if (
      typeof patternOrHandler === "function" ||
      patternOrHandler instanceof Router
    ) {
      return this.#add(patternOrHandler, protocol, method);
    }
    if (typeof handler === "function" || handler instanceof Router) {
      if (typeof patternOrHandler === "string") {
        return this.#add(handler, protocol, method, patternOrHandler);
      }
      if (patternOrHandler === true) {
        return this.#add(handler, protocol, method);
      }
      return this;
    }
    throw new Error("Handler must be a function");
  }

  #add(
    handler: RouteOrHandler,
    protocol: Protocol,
    method?: Method,
    pattern?: string,
  ): this {
    this.routes.push([
      handler,
      protocol,
      method,
      pattern,
    ]);

    return this;
  }

  async #runRouter(request: Request, parts: string[]): Promise<Response> {
    const reqMethod = request.method as Method;

    for (const [handler, pattern] of this.staticRoutes) {
      if (reqMethod !== "GET" && reqMethod !== "HEAD") {
        continue;
      }

      const params = matches(pattern, parts);

      if (!params?._.length) {
        continue;
      }

      const response = await handler(request, params._.join("/"));

      if (response.status !== 404) {
        return response;
      }
    }

    const next = (params?: Record<string, unknown>) => {
      return new Router({ ...this.params, ...params, request });
    };

    for (const route of this.routes) {
      const [handler, protocol, method, pattern] = route;

      if (method && reqMethod !== method) {
        continue;
      }
      const routeParts = typeof pattern === "string"
        ? toParts(pattern)
        : pattern;
      route[3] = routeParts; // Update the route with the parts

      const params = routeParts ? matches(routeParts, parts) : { _: parts };

      if (!params) {
        continue;
      }

      if (protocol === "WS") {
        if (!isWebsocket(request)) {
          continue;
        }

        const { response, socket } = Deno.upgradeWebSocket(request);
        Object.assign(params, { socket, response });
      }

      return await this.#runHandler(handler, {
        ...this.params,
        ...params,
        request,
        next,
      }, this.errorHandler);
    }

    if (this.defaultHandler) {
      return await this.#runHandler(this.defaultHandler, {
        ...this.params,
        _: parts,
        request,
        next,
      }, this.errorHandler);
    }

    return new Response("Not Found", { status: 404 });
  }

  async #runHandler<D extends Data>(
    handler: HandlerOrRouter<D>,
    params: Params & D,
    errorHandler?: Handler,
  ): Promise<Response> {
    let handleReturn: HandlerReturn;
    try {
      if (handler instanceof Router) {
        Object.assign(handler.params, this.params);
        handleReturn = await handler.#runRouter(params.request, params._);
      } else {
        handleReturn = await handler(params);
      }
    } catch (err) {
      const error = toError(err);
      if (errorHandler) {
        try {
          return await this.#runHandler(errorHandler, {
            ...params,
            error,
          });
        } catch (err) {
          console.error(err);
          const error = toError(err);
          return new Response(error.toString(), { status: 500 });
        }
      }
      console.error(err);
      return new Response(error.toString(), { status: 500 });
    }

    // It's a string => return an HTML response
    if (typeof handleReturn === "string") {
      return new Response(handleReturn, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // It's a Response
    if (handleReturn instanceof Response) {
      return handleReturn;
    }

    // It's a nested Router
    if (handleReturn instanceof Router) {
      return handleReturn.#runRouter(params.request, params._);
    }

    // It's something that can be used as the body of a Response
    if (handleReturn === undefined) {
      return params.response || new Response();
    }

    // It's something that can be used as the body of a Response
    if (
      !handleReturn ||
      handleReturn instanceof Uint8Array ||
      handleReturn instanceof ReadableStream ||
      handleReturn instanceof Blob ||
      handleReturn instanceof ArrayBuffer ||
      handleReturn instanceof URLSearchParams ||
      handleReturn instanceof FormData ||
      handleReturn instanceof DataView
    ) {
      return new Response(handleReturn ?? undefined);
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
}

/**
 * Convert a path to an array of directories
 * For example, "/foo/bar" becomes ["foo", "bar"]
 */
function toParts(pattern: string): string[] {
  return pattern.split("/")
    .filter((part) => part.length > 0)
    .map(decodeURIComponent);
}

/** Match a pattern with an array of directories */
function matches(pattern: string[], parts: string[]): Params | undefined {
  const captures: Record<string, string> = {};
  const hasWildcard = pattern[pattern.length - 1] === "*";

  if (hasWildcard) {
    pattern = pattern.slice(0, -1);

    if (pattern.length > parts.length) {
      return;
    }
  } else if (pattern.length !== parts.length) {
    return;
  }

  for (let i = 0; i < pattern.length; i++) {
    const part = pattern[i];
    const value = parts[i];

    if (part.startsWith(":")) {
      captures[part.slice(1)] = value;
    } else if (part !== value) {
      return;
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
