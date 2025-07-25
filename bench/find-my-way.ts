import FindMyWay from "npm:find-my-way@9.3.0";

const router = FindMyWay();

router.on("GET", "/not/:name", (_req, _res, params) => {
  const name = params.name;
  return new Response(`Hello, ${name}!`);
});

router.on("GET", "/:name", (_req, _res, params) => {
  const name = params.name;
  return new Response(`Hello, ${name}!`);
});

export default router;
