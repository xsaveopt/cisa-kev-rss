import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, afterEach, before, describe, it, mock } from "node:test";
import { createApp, resolvePort, start } from "../src/server.ts";

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

function mockFeedFetch() {
  return mock.method(
    globalThis,
    "fetch",
    async () =>
      ({
        ok: true,
        json: async () => sampleFeed,
      }) as unknown as Response,
  );
}

function listen(app: ReturnType<typeof createApp>) {
  return new Promise<{ server: ReturnType<typeof app.listen>; baseUrl: string }>((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

function close(server: { close: (cb: () => void) => unknown }) {
  return new Promise<void>((resolve) => server.close(() => resolve()));
}

describe("createApp", () => {
  let baseUrl = "";
  let server: Awaited<ReturnType<typeof listen>>["server"];

  before(async () => {
    const started = await listen(createApp());
    server = started.server;
    baseUrl = started.baseUrl;
  });

  after(async () => {
    await close(server);
  });

  it("mounts the feed route", async () => {
    const res = await fetch(`${baseUrl}/rss`);

    assert.equal(res.status, 503);
  });

  it("answers 404 for unknown paths", async () => {
    const res = await fetch(`${baseUrl}/nope`);

    assert.equal(res.status, 404);
  });

  it("sets the CORS header on a plain request", async () => {
    const res = await fetch(`${baseUrl}/rss`, { headers: { origin: "https://example.test" } });

    assert.equal(res.headers.get("access-control-allow-origin"), "*");
  });

  it("answers a CORS preflight", async () => {
    const res = await fetch(`${baseUrl}/rss`, {
      method: "OPTIONS",
      headers: {
        origin: "https://example.test",
        "access-control-request-method": "GET",
      },
    });

    assert.equal(res.status, 204);
    assert.equal(res.headers.get("access-control-allow-origin"), "*");
    assert.match(res.headers.get("access-control-allow-methods") ?? "", /GET/);
  });
});

describe("resolvePort", () => {
  const original = process.env.PORT;

  after(() => {
    if (original === undefined) {
      delete process.env.PORT;
    } else {
      process.env.PORT = original;
    }
  });

  const cases = [
    { name: "defaults to 3000 when PORT is unset", port: undefined, expected: 3000 },
    { name: "defaults to 3000 when PORT is empty", port: "", expected: 3000 },
    { name: "uses PORT when it is set", port: "8080", expected: "8080" },
    { name: "keeps a non-numeric PORT as given", port: "/tmp/app.sock", expected: "/tmp/app.sock" },
  ];

  for (const testCase of cases) {
    it(testCase.name, () => {
      if (testCase.port === undefined) {
        delete process.env.PORT;
      } else {
        process.env.PORT = testCase.port;
      }

      assert.equal(resolvePort(), testCase.expected);
    });
  }
});

describe("start", () => {
  afterEach(() => {
    mock.timers.reset();
    mock.restoreAll();
  });

  it("listens on the given port and starts tracking", async () => {
    mock.timers.enable({ apis: ["setInterval"] });
    const fetched = mockFeedFetch();

    const server = start(0);
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    await new Promise((resolve) => setImmediate(resolve));

    const { port } = server.address() as AddressInfo;
    assert.ok(port > 0);
    assert.equal(fetched.mock.callCount(), 1);

    mock.restoreAll();

    const res = await fetch(`http://127.0.0.1:${port}/rss`);
    const body = await res.text();
    await close(server);

    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /application\/rss\+xml/);
    assert.match(body, /<guid isPermaLink="false">CVE-2026-0001<\/guid>/);
  });
});
