import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { getRSS, startTracking, updateFeed } from "../src/tracker.ts";

const FEED_URL =
  "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";

const sampleFeed = {
  catalogVersion: "2026.07.10",
  dateReleased: "2026-07-10T17:00:25.000Z",
  vulnerabilities: [
    {
      cveID: "CVE-2026-0001",
      vulnerabilityName: 'Acme <Router> "RCE" & bypass',
      shortDescription: "A <script> flaw in 'Acme' & friends.",
      dateAdded: "2026-07-09",
    },
  ],
};

function mockFetch(response: Partial<Response> & { json?: () => unknown }) {
  return mock.method(globalThis, "fetch", async () => response as Response);
}

function mockFetchRejection(error: Error) {
  return mock.method(globalThis, "fetch", async () => {
    throw error;
  });
}

describe("tracker", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("returns an empty feed before the first update", () => {
    assert.equal(getRSS(), "");
  });

  it("builds an RSS document from the CISA feed", async () => {
    mockFetch({ ok: true, json: async () => sampleFeed });

    await updateFeed();
    const xml = getRSS();

    assert.match(xml, /<rss version="2\.0">/);
    assert.match(xml, /version 2026\.07\.10/);
    assert.match(xml, /<guid isPermaLink="false">CVE-2026-0001<\/guid>/);
    assert.match(xml, /<link>https:\/\/nvd\.nist\.gov\/vuln\/detail\/CVE-2026-0001<\/link>/);
  });

  it("escapes XML-unsafe characters", async () => {
    mockFetch({ ok: true, json: async () => sampleFeed });

    await updateFeed();
    const xml = getRSS();

    assert.match(xml, /Acme &lt;Router&gt; &quot;RCE&quot; &amp; bypass/);
    assert.match(xml, /A &lt;script&gt; flaw in &apos;Acme&apos; &amp; friends\./);
    assert.doesNotMatch(xml, /<script>/);
  });

  it("formats dateAdded as an RFC 822 pubDate", async () => {
    mockFetch({ ok: true, json: async () => sampleFeed });

    await updateFeed();
    const xml = getRSS();

    assert.match(xml, /<pubDate>Thu, 09 Jul 2026 00:00:00 GMT<\/pubDate>/);
  });

  it("keeps the previous feed when the fetch fails", async () => {
    mockFetch({ ok: true, json: async () => sampleFeed });
    await updateFeed();
    const good = getRSS();

    mockFetch({ ok: false, statusText: "Service Unavailable" });
    await updateFeed();

    assert.equal(getRSS(), good);
  });

  it("requests the CISA catalog", async () => {
    const fetched = mockFetch({ ok: true, json: async () => sampleFeed });

    await updateFeed();

    assert.equal(fetched.mock.callCount(), 1);
    assert.deepEqual(fetched.mock.calls[0]?.arguments, [FEED_URL]);
  });
});

describe("tracker parsing", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  const cases = [
    {
      name: "renders an empty title for a missing vulnerability name",
      vulnerability: {
        cveID: "CVE-2026-0002",
        shortDescription: "No name.",
        dateAdded: "2026-07-09",
      },
      expected: /<title>CVE-2026-0002 – <\/title>/,
    },
    {
      name: "renders an empty description for a missing short description",
      vulnerability: {
        cveID: "CVE-2026-0003",
        vulnerabilityName: "No description",
        dateAdded: "2026-07-09",
      },
      expected: /<description><\/description>/,
    },
    {
      name: "renders an invalid date as such",
      vulnerability: {
        cveID: "CVE-2026-0004",
        vulnerabilityName: "Bad date",
        shortDescription: "Bad date.",
        dateAdded: "not-a-date",
      },
      expected: /<pubDate>Invalid Date<\/pubDate>/,
    },
    {
      name: "keeps an empty description empty",
      vulnerability: {
        cveID: "CVE-2026-0005",
        vulnerabilityName: "Empty",
        shortDescription: "",
        dateAdded: "2026-07-09",
      },
      expected: /<description><\/description>/,
    },
  ];

  for (const testCase of cases) {
    it(testCase.name, async () => {
      mockFetch({
        ok: true,
        json: async () => ({ ...sampleFeed, vulnerabilities: [testCase.vulnerability] }),
      });

      await updateFeed();

      assert.match(getRSS(), testCase.expected);
    });
  }

  it("builds a channel without items for an empty catalog", async () => {
    mockFetch({ ok: true, json: async () => ({ ...sampleFeed, vulnerabilities: [] }) });

    await updateFeed();
    const xml = getRSS();

    assert.match(xml, /<channel>/);
    assert.doesNotMatch(xml, /<item>/);
  });
});

describe("tracker failure paths", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  const cases = [
    {
      name: "the request rejects",
      arrange: () => mockFetchRejection(new TypeError("fetch failed")),
    },
    {
      name: "the response is not ok",
      arrange: () => mockFetch({ ok: false, statusText: "Service Unavailable" }),
    },
    {
      name: "the body is not JSON",
      arrange: () =>
        mockFetch({
          ok: true,
          json: async () => {
            throw new SyntaxError("Unexpected token < in JSON");
          },
        }),
    },
    {
      name: "the body ends early",
      arrange: () =>
        mockFetch({
          ok: true,
          json: async () => {
            throw new TypeError("terminated: unexpected end of file");
          },
        }),
    },
    {
      name: "the payload is null",
      arrange: () => mockFetch({ ok: true, json: async () => null }),
    },
    {
      name: "the payload has no vulnerabilities",
      arrange: () =>
        mockFetch({
          ok: true,
          json: async () => ({ catalogVersion: "2026.07.10", dateReleased: "2026-07-10" }),
        }),
    },
    {
      name: "vulnerabilities is not an array",
      arrange: () =>
        mockFetch({ ok: true, json: async () => ({ ...sampleFeed, vulnerabilities: "nope" }) }),
    },
  ];

  for (const testCase of cases) {
    it(`keeps the previous feed when ${testCase.name}`, async () => {
      mockFetch({ ok: true, json: async () => sampleFeed });
      await updateFeed();
      const good = getRSS();
      mock.restoreAll();

      testCase.arrange();

      await assert.doesNotReject(() => updateFeed());
      assert.equal(getRSS(), good);
    });
  }
});

describe("startTracking", () => {
  afterEach(() => {
    mock.timers.reset();
    mock.restoreAll();
  });

  const schedules = [
    { name: "every minute", minutes: 1 },
    { name: "every ten minutes", minutes: 10 },
    { name: "every three quarters of an hour", minutes: 45 },
  ];

  for (const { name, minutes } of schedules) {
    it(`updates once immediately and then ${name}`, () => {
      mock.timers.enable({ apis: ["setInterval"] });
      const fetched = mockFetch({ ok: true, json: async () => sampleFeed });
      const period = minutes * 60 * 1000;

      startTracking(minutes);
      assert.equal(fetched.mock.callCount(), 1);

      mock.timers.tick(period - 1);
      assert.equal(fetched.mock.callCount(), 1);

      mock.timers.tick(1);
      assert.equal(fetched.mock.callCount(), 2);

      mock.timers.tick(period * 3);
      assert.equal(fetched.mock.callCount(), 5);
    });
  }

  it("keeps polling after a failed update", () => {
    mock.timers.enable({ apis: ["setInterval"] });
    const fetched = mockFetchRejection(new TypeError("fetch failed"));

    startTracking(10);
    mock.timers.tick(10 * 60 * 1000);
    mock.timers.tick(10 * 60 * 1000);

    assert.equal(fetched.mock.callCount(), 3);
  });
});
