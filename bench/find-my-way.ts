import FindMyWay from "npm:find-my-way@9.3.0";

const router = FindMyWay();

for (let i = 1; i <= 10; i++) {
  router.on("GET", `/not${i}/:name`, () => new Response("Nop"));
}

router.on("GET", "/:name", (_req, _res, params) => {
  const name = params.name;
  return new Response(`Hello, ${name}!`);
});

for (let i = 11; i <= 10; i++) {
  router.on("GET", `/not${i}/:name`, () => new Response("Nop"));
}
export default router;
