import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import express from "express";

process.env.RSS_PATH = "/feeds/kev.xml";
const routes = (await import("../src/routes.ts")).default;

describe("routes with RSS_PATH set", () => {
  const app = express();
  app.use("/", routes);
  let baseUrl = "";
  let server: ReturnType<typeof app.listen>;

  before(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const { port } = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("serves the feed from the overridden path", async () => {
    const res = await fetch(`${baseUrl}/feeds/kev.xml`);

    assert.equal(res.status, 503);
    assert.equal(await res.text(), "RSS feed not ready yet");
  });

  it("no longer serves the default path", async () => {
    const res = await fetch(`${baseUrl}/rss`);

    assert.equal(res.status, 404);
  });
});
