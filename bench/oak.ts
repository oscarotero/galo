import { Application } from "jsr:@oak/oak@17.1.5/application";
import { Router } from "jsr:@oak/oak@17.1.5/router";

const router = new Router();
router.get("/not/:name", (ctx) => {
  const name = ctx.params.name;
  ctx.response.body = `Hello, ${name}!`;
});
router.get("/:name", (ctx) => {
  const name = ctx.params.name;
  ctx.response.body = `Hello, ${name}!`;
});

const app = new Application();
app.use(router.routes());

export default app;
