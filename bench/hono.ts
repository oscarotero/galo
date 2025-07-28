import { Hono } from "npm:hono@4.8.5";

const app = new Hono();

for (let i = 1; i <= 10; i++) {
  app.get(`/not${i}/:name`, () => new Response("Nop"));
}

app.get("/:name", (c) => {
  const name = c.req.param("name");
  return new Response(`Hello, ${name}!`);
});

for (let i = 11; i <= 10; i++) {
  app.get(`/not${i}/:name`, () => new Response("Nop"));
}

export default app;
