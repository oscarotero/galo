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

## Streams

The simplest way to create a stream response is by returning an async generator:

```js
app.get("stream", async function* () {
  yield name + "This is a stream\n";
  await wait(1000);
  yield name + "This is another message\n";
  await wait(1000);
  yield name + "This is the last message\n";
});
```

For more advanced use cases, you can return a `ReadableStream` or a `Response`
with the `ReadableStream` as the body (example from
[Deno docs](https://docs.deno.com/examples/http_server_websocket/)):

```js
app.get("/stream", () => {
  let timer: number | undefined = undefined;

  return new ReadableStream({
    start(controller) {
      timer = setInterval(() => {
        const message = `It is ${new Date().toISOString()}\n`;
        controller.enqueue(new TextEncoder().encode(message));
      }, 100);
    },

    cancel() {
      if (timer !== undefined) {
        clearInterval(timer);
      }
    },
  });
})
```
