import { Hono } from "npm:hono@4.8.5";

const app = new Hono();

app.get("/not/:name", (c) => {
  const name = c.req.param("name");
  return c.text(`Hello, ${name}!`);
});

app.get("/:name", (c) => {
  const name = c.req.param("name");
  return c.text(`Hello, ${name}!`);
});

export default app;
