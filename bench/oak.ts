import { Application } from "jsr:@oak/oak@17.1.5/application";
import { Router } from "jsr:@oak/oak@17.1.5/router";

const router = new Router();

for (let i = 1; i <= 10; i++) {
  router.get(`/not${i}/:name`, (ctx) => ctx.response.body = "Nop");
}

router.get("/:name", (ctx) => {
  const name = ctx.params.name;
  ctx.response.body = `Hello, ${name}!`;
});

const app = new Application();
app.use(router.routes());

export default app;
