import { assertEquals } from "jsr:@std/assert@1.0.13/equals";
import Router from "./mod.ts";

Deno.test("Basic methods", async () => {
  const router = new Router();
  router.get("/hello", () => new Response("Hello, GET!"));
  router.post("/hello", () => new Response("Hello, POST!"));
  router.put("//hello//", () => new Response("Hello, PUT!"));
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

Deno.test("Nested routes without default/error handlers", async () => {
  const router = new Router();
  router.default(() => new Response("[TOP] Not Found", { status: 404 }));
  router.catch(({ error }) => {
    return new Response(`[TOP] Error: ${error.message}`, { status: 500 });
  });
  router.path("/nested/:name/*", ({ next, name }) => {
    return next()
      .get("/hello", () => new Response(`Hello ${name} from nested GET!`))
      .post("/hello", () => {
        throw new Error(`system failure, ${name}`);
      });
  });

  await assert(
    ["PUT", "/nested/John/hello"],
    router,
    "[TOP] Not Found",
  );
  await assert(
    ["POST", "/nested/Neo/hello"],
    router,
    "[TOP] Error: system failure, Neo",
  );
});

Deno.test("Nested routes with explicit default/error handlers", async () => {
  const router = new Router();
  router.default(() => new Response("[TOP] Not Found", { status: 404 }));
  router.catch(({ error }) => {
    return new Response(`[TOP] Error: ${error.message}`, { status: 500 });
  });
  router.path("/nested/:name/*", ({ next, name }) => {
    return next()
      .default(() => new Response("[NESTED] Not Found", { status: 404 }))
      .get("/hello", () => new Response(`Hello ${name} from nested GET!`))
      .post("/hello", () => {
        throw new Error(`system failure, ${name}`);
      })
      .catch(({ error }) => {
        return new Response(`[NESTED] Error: ${error.message}`, {
          status: 500,
        });
      });
  });

  await assert(
    ["PUT", "/nested/John/hello"],
    router,
    "[NESTED] Not Found",
  );
  await assert(
    ["POST", "/nested/Neo/hello"],
    router,
    "[NESTED] Error: system failure, Neo",
  );
});

Deno.test("Static files", async () => {
  const router = new Router();
  router.staticFiles("/bench/*", Deno.cwd() + "/bench");

  await assert(["GET", "/bench/galo.ts"], router, 200);
  await assert(["HEAD", "/bench/galo.ts"], router, 200);
  await assert(["GET", "/bench/other.ts"], router, 404);
});

Deno.test("Base path", async () => {
  const router = new Router({}, "/sub-folder");

  router.get("/hello", () => new Response("It works"));

  await assert(["GET", "/sub-folder"], router, 404);
  await assert(["GET", "/hello"], router, 404);
  await assert(["GET", "/sub-folder/hello"], router, "It works");
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
    response.body?.cancel();
  } else {
    assertEquals(await response.text(), expected);
  }
}
