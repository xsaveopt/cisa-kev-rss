import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, it, mock } from "node:test";
import express from "express";
import routes from "../src/routes.ts";
import { updateFeed } from "../src/tracker.ts";

const sampleFeed = {
  catalogVersion: "2026.07.10",
  dateReleased: "2026-07-10T17:00:25.000Z",
  vulnerabilities: [
    {
      cveID: "CVE-2026-0001",
      vulnerabilityName: "Sample vulnerability",
      shortDescription: "A sample flaw.",
      dateAdded: "2026-07-09",
    },
  ],
};

describe("routes", () => {
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

  it("returns 503 while the feed is not ready", async () => {
    const res = await fetch(`${baseUrl}/rss`);
    assert.equal(res.status, 503);
  });

  it("serves the RSS feed once it is ready", async () => {
    mock.method(
      globalThis,
      "fetch",
      async () =>
        ({
          ok: true,
          json: async () => sampleFeed,
        }) as unknown as Response,
    );
    await updateFeed();
    mock.restoreAll();

    const res = await fetch(`${baseUrl}/rss`);
    const body = await res.text();

    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /application\/rss\+xml/);
    assert.match(body, /<guid isPermaLink="false">CVE-2026-0001<\/guid>/);
  });

  it("returns 404 for unknown paths", async () => {
    const res = await fetch(`${baseUrl}/nope`);
    assert.equal(res.status, 404);
  });
});
