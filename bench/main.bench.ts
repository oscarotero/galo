import hono from "./hono.ts";
import galo from "./galo.ts";
import findMyWay from "./find-my-way.ts";

Deno.bench("Hono", async () => {
  const response = await hono.fetch(new Request("http://localhost/World"));
  console.assert(await response.text() === "Hello, World!");
});

Deno.bench("Galo", async () => {
  const response = await galo.fetch(new Request("http://localhost/World"));
  console.assert(await response.text() === "Hello, World!");
});

Deno.bench("Find My Way", async () => {
  const response = await findMyWay.lookup(
    // @ts-ignore: Find My Way expects a Node.js-style request object
    new Request("http://localhost/World"),
    null,
  );
  console.assert(await response.text() === "Hello, World!");
});
