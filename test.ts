import { stub } from "jsr:@std/testing@1.0.13/mock";
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

Deno.test("Nested routes (dynamic) without explicit default/error handlers configured", async (t) => {
  const router = new Router({ routerId: "1" });
  router.default(({ routerId }) =>
    new Response(`[TOP][${routerId}] Not Found`, { status: 404 })
  );
  router.catch(({ error }) => {
    return new Response(`[TOP] Error: ${error.message}`, {
      status: 500,
    });
  });
  router.path("/nested/:name/*", ({ next, name }) => {
    return next({ routerId: "2" })
      .get("/hello", () => new Response(`Hello ${name} from nested GET!`))
      .post("/hello", ({ routerId }) => {
        throw new Error(`[${routerId}] system failure, ${name}`);
      });
  });

  await t.step(
    "should use the parent default/error handler, and own data",
    async () => {
      await assert(
        ["PUT", "/nested/John/hello"],
        router,
        "[TOP][2] Not Found",
      );
      await assert(
        ["POST", "/nested/Neo/hello"],
        router,
        "[TOP] Error: [2] system failure, Neo",
      );
    },
  );
});

Deno.test("Nested routes (dynamic) with explicit default/error handlers configured", async (t) => {
  const router = new Router({ routerId: "1" });
  router.default(({ routerId }) =>
    new Response(`[TOP][${routerId}] Not Found`, { status: 404 })
  );
  router.catch(({ routerId, error }) => {
    return new Response(`[TOP][${routerId}] Error: ${error.message}`, {
      status: 500,
    });
  });
  router.path("/nested/:name/*", ({ next, name }) => {
    return next({ routerId: "2" })
      .default(({ routerId }) =>
        new Response(`[NESTED][${routerId}] Not Found`, { status: 404 })
      )
      .get("/hello", () => new Response(`Hello ${name} from nested GET!`))
      .post("/hello", () => {
        throw new Error(`system failure, ${name}`);
      })
      .catch(({ routerId, error }) => {
        return new Response(`[NESTED][${routerId}] Error: ${error.message}`, {
          status: 500,
        });
      });
  });

  await t.step(
    "should use their own default/error handler, and data",
    async () => {
      await assert(
        ["PUT", "/nested/John/hello"],
        router,
        "[NESTED][2] Not Found",
      );
      await assert(
        ["POST", "/nested/Neo/hello"],
        router,
        "[NESTED][2] Error: system failure, Neo",
      );
    },
  );
});

Deno.test("Nested routers without default/error handlers configured", async (t) => {
  const router = new Router({ routerId: "1" });
  router.default(({ routerId }) =>
    new Response(`[TOP][${routerId}] Not Found`, { status: 404 })
  );
  router.catch(({ error }) => {
    return new Response(`[TOP] Error: ${error.message}`, {
      status: 500,
    });
  });

  const nestedRouter = new Router({ routerId: "2" })
    .path("/:name/*", ({ next, name }) => {
      return next()
        .get("/hello", () => new Response(`Hello ${name} from nested GET!`))
        .post("/hello", ({ routerId }) => {
          throw new Error(`[${routerId}] system failure, ${name}`);
        });
    });

  router.path("/nested/*", nestedRouter);

  await t.step("when used as part of another router", async (t) => {
    await t.step(
      "should use the parent default/error handler, and parent router data",
      async () => {
        await assert(
          ["PUT", "/nested/John/hello"],
          router,
          "[TOP][1] Not Found",
        );
        await assert(
          ["POST", "/nested/Neo/hello"],
          router,
          "[TOP] Error: [1] system failure, Neo",
        );
      },
    );
  });

  await t.step("when used as standalone router", async (t) => {
    using _logStub = stub(console, "error");
    await t.step(
      "should use their own default/error handler, and data",
      async () => {
        await assert(
          ["PUT", "/John/hello"],
          nestedRouter,
          "Not Found",
        );
        await assert(
          ["POST", "/Neo/hello"],
          nestedRouter,
          "Error: [2] system failure, Neo",
        );
      },
    );
  });
});

Deno.test("Nested routers with explicit default/error handlers configured", async (t) => {
  const router = new Router({ routerId: "1" });
  router.default(({ routerId }) =>
    new Response(`[TOP][${routerId}] Not Found`, { status: 404 })
  );
  router.catch(({ routerId, error }) => {
    return new Response(`[TOP][${routerId}] Error: ${error.message}`, {
      status: 500,
    });
  });

  const nestedRouter = new Router({ routerId: "2" })
    .path("/:name/*", ({ next, name }) => {
      return next()
        .get("/hello", () => new Response(`Hello ${name} from nested GET!`))
        .post("/hello", () => {
          throw new Error(`system failure, ${name}`);
        });
    })
    .default(({ routerId }) =>
      new Response(`[NESTED][${routerId}] Not Found`, { status: 404 })
    )
    .catch(({ routerId, error }) => {
      return new Response(`[NESTED][${routerId}] Error: ${error.message}`, {
        status: 500,
      });
    });

  router.path("/nested/*", nestedRouter);

  await t.step("when used as part of another router", async (t) => {
    await t.step(
      "should use their own default/error handler, and parent router data",
      async () => {
        await assert(
          ["PUT", "/nested/John/hello"],
          router,
          "[NESTED][1] Not Found",
        );
        await assert(
          ["POST", "/nested/Neo/hello"],
          router,
          "[NESTED][1] Error: system failure, Neo",
        );
      },
    );
  });

  await t.step("when used as standalone router", async (t) => {
    await t.step(
      "should use their own default/error handler, and data",
      async () => {
        await assert(
          ["PUT", "/John/hello"],
          nestedRouter,
          "[NESTED][2] Not Found",
        );
        await assert(
          ["POST", "/Neo/hello"],
          nestedRouter,
          "[NESTED][2] Error: system failure, Neo",
        );
      },
    );
  });
});

Deno.test("Nested routers with multiple levels maintain the top level data", async (t) => {
  const router = new Router({ secret: "1" });
  const secondRouter = new Router({ secret: "2" });
  const thirdRouter = new Router({ secret: "3" })
    .path("/:provider/*", ({ next, method, provider, secret }) => {
      return next()
        .get(
          "/",
          () => new Response(JSON.stringify({ method, provider, secret })),
        );
    });
  secondRouter.path("/:method/*", thirdRouter);
  router.path("/api/*", secondRouter);

  await t.step("when used in a chain of routers", async (t) => {
    await t.step(
      "should use the top parent router data",
      async () => {
        await assert(
          ["GET", "/api/oauth/github"],
          router,
          JSON.stringify({ method: "oauth", provider: "github", secret: "1" }),
        );
      },
    );
  });

  await t.step("when used as part of another router", async (t) => {
    await t.step(
      "should use the parent router data",
      async () => {
        await assert(
          ["GET", "/oauth/github"],
          secondRouter,
          JSON.stringify({ method: "oauth", provider: "github", secret: "2" }),
        );
      },
    );
  });

  await t.step("when used as standalone router", async (t) => {
    await t.step(
      "should use their own data",
      async () => {
        await assert(
          ["GET", "/github"],
          thirdRouter,
          JSON.stringify({ provider: "github", secret: "3" }),
        );
      },
    );
  });
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
