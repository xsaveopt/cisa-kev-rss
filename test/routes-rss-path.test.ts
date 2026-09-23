import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import express from "express";

process.env.RSS_PATH = "/feeds/kev.xml";
const { default: routes, deriveHealthPath } = await import("../src/routes.ts");

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

  it("serves health under the derived subpath", async () => {
    const res = await fetch(`${baseUrl}/feeds/health`);

    assert.equal(res.status, 503);
    assert.equal(await res.text(), "degraded");
  });

  it("no longer serves health at the root", async () => {
    const res = await fetch(`${baseUrl}/health`);

    assert.equal(res.status, 404);
  });
});

describe("deriveHealthPath", () => {
  const cases = [
    { rssPath: "/rss", expected: "/health" },
    { rssPath: "/rss/", expected: "/health" },
    { rssPath: "/blabla/rss", expected: "/blabla/health" },
    { rssPath: "/blabla/rss/", expected: "/blabla/health" },
    { rssPath: "/a/b/c/rss", expected: "/a/b/c/health" },
  ];

  for (const testCase of cases) {
    it(`derives ${testCase.expected} from ${testCase.rssPath}`, () => {
      assert.equal(deriveHealthPath(testCase.rssPath), testCase.expected);
    });
  }
});
