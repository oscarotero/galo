import Router from "../mod.ts";

const router = new Router();

router.get("/not/:name", ({ name }) => {
  return new Response(`Hello, ${name}!`);
});

router.get("/:name", ({ name }) => {
  return new Response(`Hello, ${name}!`);
});

export default router;
