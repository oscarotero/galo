# Galo

Minimalist fast & flexible router.

## Getting started

```js
// app.ts
import Router from "galo/mod.ts";

const app = new Router();

app
  .get("/", () => new Response("Hello world"))

  //For convenience, return a string to create a HTML response:
  .get("/hello.html", () => "Hello <strong>world</strong>")

  //Return an object or array to create a JSON response:
  .get("/hello.json", () => ({ text: "Hello world" }))

  //Captured values are passed as properties
  .get("/:name", ({ name }) => `Hello <strong>${name}</strong>`)

  //Support wilcard to capture the remaining path (array stored in the `_` property)
  .get("/example/*", ({ _ }) => `The wildcard content is: ${_.join(", ")}`);

  //The `Request` instance is passed as `request` property:
  .get("/hello", ({ request }) => `Hello from ${request.url}`)

//Returns the app so you can run it with `deno serve app.ts`
export default app;
```

## API:

- `path(path, callback)`: Matches requests for a specific path.
- `get(path, callback)`: Matches GET requests for a specific path.
- `get(callback)`: Matches GET requests for any path.
- `post(path, callback)`: Matches POST requests for a specific path.
- `post(callback)`: Matches POST requests for any path.
- `put(path, callback)`: Matches PUT requests for a specific path.
- `put(callback)`: Matches PUT requests for any path.
- `delete(path, callback)`: Matches DELETE requests for a specific path.
- `delete(callback)`: Matches DELETE requests for any path.
- `socket(callback)`: Matches requests with WebSocket connections for any path.
- `socket(path, callback)`: Matches requests with WebSocket connections for a
  specific path.
- `sse(callback)`: Matches requests with Server-Send Events for any path.
- `sse(path, callback)`: Matches requests with Server-Send Events for a specific
  path.
- `default(callback)`: Default handler for unmatched requests.
- `catch(callback)`: Error handler to capture exceptions.
- `staticFiles(path, root)`: Serve static files from a folder.

## Slashes

Trailing, leading or duplicated slashes are ignored by the router.

```js
// The following routes are equivalent
app.get("/hello/world", () => "Hello world");
app.get("/hello/world/", () => "Hello world");
app.get("hello//world", () => "Hello world");
```

## Nested routes

Any route handler can return another router (created with the `next` function)
to prolong the flow.

```js
//Capture all requests to `/hello/:name` path
app.path("/hello/:name", ({ next, name }) => {
  //Return a different response per HTTP method:
  return next()
    .get(() => `Hello ${name} from GET`)
    .post(() => `Hello ${name} from POST`)
    .put(() => `Hello ${name} from PUT`)
    .delete(() => `Hello ${name} from DELETE`);
});
```

Use a wildcard in the parent route to allow nested routes to match additional
path segments:

```js
app.get("/good/*", ({ next }) => {
  return next()
    .path("/morning", () => "Good morning")
    .path("/afternoon", () => "Good afternoon")
    .path("/night", () => "Good night");
});
```

The nested routes are useful to create a REST API:

```js
app.path("/item/:id", ({ id, next }) => {
  const item = getItem(id);

  if (!item) {
    return new Response("Not Found", { status: 404 });
  }

  return next()
    .get(() => printItem(item))
    .put(() => updateItem(item))
    .delete(() => deleteItem(item));
});
```

## Error handler

Use the `catch()` function to handle errors and generate a custom response. The
caught error is available in the `error` property.

```js
app.catch(({ error }) =>
  new Response(`Server error: ${error}`, { status: 500 })
);
```

## Web sockets

The `.socket()` function creates a route to capture a WebSocket connection. You
can use the `socket` property to access to the `WebSocket` instance:

```js
app.socket("/ws", ({ socket }) => {
  socket.onopen = () => console.log("Connection opened");

  socket.onmessage = (event) => {
    console.log("Message from client:", event.data);
    socket.send(`Echo: ${event.data}`);
  };

  socket.onclose = () => console.log("Connection closed");
});
```

## Server-Sent Events

The `.sse()` function creates a route to return a server-send event stream. Use
an async iterator:

```js
import type { ServerSentEventMessage } from "galo/mod.ts";

app.sse("/sse", async function *(): AsyncGenerator<ServerSentEventMessage> {
  console.log("SSE connection established:");
  
  // Simulate sending messages every second
  for (let i = 0; i < 1000; i++) {
    yield { data: `Message ${i + 1}` };
    await wait(1000);
  }
});
```

## Allowed router returns

Routers can returns different types of data:

### `Response`

Return a `Response` instance for full control:

```js
app.get("/hello", () => new Response("Hello world"));
```

### strings

If a router returns a `string` it's converted to a HTML response:

```js
app.get("/hello", () => "Hello world");

// Equivalent to:
app.get("/hello", () =>
  new Response("Hello world", {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  }));
```

### Body

Instances of `Uint8Array`, `ReadableStream`, `Blob`, `ArrayBuffer`,
`URLSearchParams`, `FormData`, `DataView` are used as the body of a `Response`:

```js
app.get("/hello", () => Uint8Array.fromBase64("PGI+ TURO PC9i Ph"));

// Equivalent to:
app.get(
  "/hello",
  () => new Response(Uint8Array.fromBase64("PGI+ TURO PC9i Ph")),
);
```

### `File` instances

`File` instances are converted automatically to a HTTP response:

```js
app.get("/hello", () => new File(["foo"], "foo.txt", { type: "text/plain" }));

// Equivalent to:
app.get("/hello", () =>
  new Response("foo", {
    status: 200,
    headers: {
      "Content-Type": "text/plain",
      "Content-Length": 3,
      "Content-Disposition": `attachment; filename="foo.txt"`,
    },
  }));
```

### Async generators

The simplest way to create a stream response is by returning an async generator:

```js
app.get("/hello", async function* () {
  yield "This is a stream\n";
  await wait(1000);
  yield "This is another message\n";
  await wait(1000);
  yield "This is the last message\n";
});

// Equivalent to:
app.get("/hello", () =>
  new Response(
    new ReadableStream({
      async start(controller) {
        controller.enqueue(
          new TextEncoder().encode("This is a stream\n"),
        );
        await wait(1000);
        controller.enqueue(
          new TextEncoder().encode("This is another message\n"),
        );
        await wait(1000);
        controller.enqueue(
          new TextEncoder().encode("This is the last message\n"),
        );
        controller.close();
      },
    }),
  ));
```

Async generators are also used for server-sent events.

## Static files

Use the `staticFiles()` function to serve files from folders.

```js
const root = Deno.cwd() + "/static";

// Serve all requests.
// Requests that return 404 will be handled by the regular routes.
app.staticFiles("/*", root);

// Serve only requests starting with `/img/`
app.staticFiles("/img/*", root + "/img");
```

## Distribute the app in different files

For large apps, you may want to distribute routes in different files. You can
use a `Router` instances as route handlers. Example:

```js
// routes/items.ts
import { Router } from "galo/mod.ts";

const app = new Router();

app.get("/", listItems);
app.post("/", createItem);
app.get("/:id", returnItem);

export default app;
```

Then, import it and mount on the paths /items:

```js
import items from "./routes/items.ts";

const app = new Router();

app.path("/items/*", items);
```
