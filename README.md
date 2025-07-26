# Galo

Minimalist fast & flexible router.

## Getting started

Let's start with this simple app, to return a "Hello world" response to a
`GET /` HTTP request.

```js
import Router from "galo/mod.ts";

const app = new Router();

app.get("/", () => new Response("Hello world"));
```

For convenience, you can return a string to create a HTML response:

```js
app.get("/", () => "Hello <strong>world</strong>");
```

Capture values from the path:

```js
app.get("/:name", ({ name }) => `Hello <strong>${name}</strong>`);
```

Use a willcard to capture the remaining directories (array stored in the `_`
property).

```js
app.get("/:name/*", ({ name, _ }) => `Hello ${name} and ${_.join(", ")}`);
```

The `Request` instance is stored in the `request` property:

```js
app.get("/:name", ({ name, request }) => `Hello ${name} from ${request.url}`);
```

## Slashes

Trailing or leading slashes are ignored by the router.

```js
// The following routes are equivalent
app.get("/hello/world", () => "Hello world");
app.get("/hello/world/", () => "Hello world");
app.get("hello/world", () => "Hello world");
```

## Nested routes

Use a wildcard and the `next` property to create nested routes:

```js
app.get("/hello/:name/*", ({ name, next }) => {
  return next()
    .path("/morning", () => `Good morning, ${name}`)
    .path("/afternoon", () => `Good afternoon, ${name}`)
    .path("/night", () => `Good night, ${name}`);
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

### Booleans

Instead of paths, it's possible to use booleans to match a route:

```js
app.path("/item/:action/:id", ({ action, id, next }) => {
  const item = getItem(id);

  if (!item) {
    return new Response("Not Found", { status: 404 });
  }

  return next()
    .get(action === "view", () => printItem(item))
    .get(action === "edit", () => editForm(item))
    .post(action === "edit", () => editItem(item));
});
```

## Default handler

The `default()` function allows to specify a default handler:

```js
app
  .get("/", () => "Welcome")
  .get("/about", () => "About me")
  .default(() => new Response("Not Found", { status: 404 }));
```

It can be used also as a nested route:

```js
app.get("/hello/:name/*", ({ name, next }) => {
  return next()
    .path("/morning", () => `Good morning, ${name}`)
    .path("/afternoon", () => `Good afternoon, ${name}`)
    .path("/night", () => `Good night, ${name}`)
    .default(() => `Hello, ${name}!`);
});
```

## Error handler

Use the `catch()` function to generate a custom response on error:

```js
app.catch(({ error }) =>
  new Response(`Server error: ${error}`, { status: 500 })
);
```

## Web sockets

The `.webSocket()` function creates a route to capture a WebSocket connection.
You can use the `socket` property to access to the `WebSocket` instance:

```js
app.webSocket("/ws", ({ socket }) => {
  socket.onopen = () => console.log("Connection opened");

  socket.onmessage = (event) => {
    console.log("Message from client:", event.data);
    socket.send(`Echo: ${event.data}`);
  };

  socket.onclose = () => console.log("Connection closed");
});
```

Of course, you can create webSockets in sub-routes:

```js
app.path("/:name/*", ({ name, next }) => {
  return next()
    .webSocket("ws", ({ socket }) => {
      socket.onopen = () => console.log(`Hello ${name}`);

      socket.onmessage = (event) => {
        console.log(`Message from ${name}:`, event.data);
        socket.send(`Echo: ${event.data}`);
      };

      socket.onclose = () => console.log(`Bye ${name}!`);
    });
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

## Static files

Use the `staticFiles()` router to serve files from folders.

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

Then, import them and mount on the paths /items:

```js
import items from "./routes/items.ts";

const app = new Router();

app.path("/items/*", items);
```
