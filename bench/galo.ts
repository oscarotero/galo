import Router from "../mod.ts";

const router = new Router();

for (let i = 1; i <= 10; i++) {
  router.get(`/not${i}/:name`, () => new Response("Nop"));
}

router.get("/:name", ({ name }) => {
  return new Response(`Hello, ${name}!`);
});

export default router;
