import { assertEquals } from "jsr:@std/assert@1.0.13/equals";
import Router from "./mod.ts";

Deno.test("Basic methods", async () => {
  const router = new Router();
  router.get("/hello", () => new Response("Hello, GET!"));
  router.post("/hello", () => new Response("Hello, POST!"));
  router.put("/hello", () => new Response("Hello, PUT!"));
  router.delete("/hello", () => new Response("Hello, DELETE!"));
  router.path(
    "/other",
    ({ request }) => new Response(`Other, ${request.method}!`),
  );
  router.default(() => new Response("Not found", { status: 404 }));
  router.get("/error", () => {
    throw new Error("This is an error");
  });
  router.catch(({ error }) => {
    return new Response(`Error: ${error.message}`, { status: 500 });
  });

  await assert(["GET", "/hello"], router, "Hello, GET!");
  await assert(["POST", "/hello"], router, "Hello, POST!");
  await assert(["PUT", "/hello"], router, "Hello, PUT!");
  await assert(["DELETE", "/hello"], router, "Hello, DELETE!");
  await assert(["GET", "/other"], router, "Other, GET!");
  await assert(["POST", "/other"], router, "Other, POST!");
  await assert(["PUT", "/other"], router, "Other, PUT!");
  await assert(["DELETE", "/other"], router, "Other, DELETE!");
  await assert(["GET", "/not-found"], router, 404);
  await assert(["GET", "/not-found"], router, "Not found");
  await assert(["GET", "/error"], router, "Error: This is an error");
});

Deno.test("Nested routes", async () => {
  const router = new Router();
  router.path("/nested/:name/*", ({ next, name }) => {
    return next()
      .get("/hello", () => new Response(`Hello ${name} from nested GET!`))
      .post("/hello", () => new Response(`Hello ${name} from nested POST!`));
  });

  await assert(
    ["GET", "/nested/John/hello"],
    router,
    "Hello John from nested GET!",
  );
  await assert(
    ["POST", "/nested/John/hello"],
    router,
    "Hello John from nested POST!",
  );
});

// sanitizeResources is set to true due https://github.com/denoland/std/issues/6776
Deno.test("Static files", { sanitizeResources: false }, async () => {
  const router = new Router();
  router.staticFiles("/bench/*", Deno.cwd() + "/bench");

  await assert(["GET", "/bench/galo.ts"], router, 200);
  await assert(["HEAD", "/bench/galo.ts"], router, 200);
  await assert(["GET", "/bench/other.ts"], router, 404);
});

async function assert(
  request: Request | [string, string],
  router: Router,
  expected: number | string,
) {
  const response = await router.fetch(
    Array.isArray(request)
      ? new Request(new URL(request[1], "http://localhost"), {
        method: request[0],
      })
      : request,
  );

  if (typeof expected === "number") {
    assertEquals(response.status, expected);
  } else {
    assertEquals(await response.text(), expected);
  }
}
