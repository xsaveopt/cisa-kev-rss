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
    assert.equal(fetched.mock.calls[0]?.arguments[0], FEED_URL);
  });
});

describe("tracker escaping", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  const unsafe = `x<evil attr="1"/>&'`;
  const escaped = "x&lt;evil attr=&quot;1&quot;/&gt;&amp;&apos;";

  const cases = [
    {
      name: "cveID",
      feed: {
        ...sampleFeed,
        vulnerabilities: [{ ...sampleFeed.vulnerabilities[0], cveID: `CVE-2026-0006${unsafe}` }],
      },
      expected: [
        `<guid isPermaLink="false">CVE-2026-0006${escaped}</guid>`,
        `<link>https://nvd.nist.gov/vuln/detail/CVE-2026-0006${escaped}</link>`,
        `<title>CVE-2026-0006${escaped} – `,
      ],
    },
    {
      name: "catalogVersion",
      feed: { ...sampleFeed, catalogVersion: `2026.07.10${unsafe}` },
      expected: [`version 2026.07.10${escaped} (released`],
    },
    {
      name: "dateReleased",
      feed: { ...sampleFeed, dateReleased: `2026-07-10${unsafe}` },
      expected: [`(released 2026-07-10${escaped})`],
    },
  ];

  for (const testCase of cases) {
    it(`escapes XML-unsafe characters in ${testCase.name}`, async () => {
      mockFetch({ ok: true, json: async () => testCase.feed });

      await updateFeed();
      const xml = getRSS();

      assert.ok(!xml.includes("<evil"), "raw markup leaked into the feed");
      assert.doesNotMatch(xml, /&(?!(?:amp|lt|gt|quot|apos);)/);
      for (const fragment of testCase.expected) {
        assert.ok(xml.includes(fragment), `missing ${fragment}`);
      }
    });
  }
});

describe("tracker document", () => {
  afterEach(() => {
    mock.timers.reset();
    mock.restoreAll();
  });

  const multiFeed = {
    ...sampleFeed,
    vulnerabilities: [
      {
        cveID: "CVE-2026-0101",
        vulnerabilityName: "First flaw",
        shortDescription: "First description.",
        dateAdded: "2026-07-01",
      },
      {
        cveID: "CVE-2026-0102",
        vulnerabilityName: "Second flaw",
        shortDescription: "Second description.",
        dateAdded: "2026-07-02",
      },
      {
        cveID: "CVE-2026-0103",
        vulnerabilityName: "Third flaw",
        shortDescription: "Third description.",
        dateAdded: "2026-07-03",
      },
    ],
  };

  it("renders one item per vulnerability in catalog order", async () => {
    mockFetch({ ok: true, json: async () => multiFeed });

    await updateFeed();
    const xml = getRSS();

    const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
    assert.equal(items.length, 3);
    multiFeed.vulnerabilities.forEach((v, index) => {
      const item = items[index] ?? "";
      assert.ok(item.includes(`<title>${v.cveID} – ${v.vulnerabilityName}</title>`));
      assert.ok(item.includes(`<guid isPermaLink="false">${v.cveID}</guid>`));
      assert.ok(item.includes(`<link>https://nvd.nist.gov/vuln/detail/${v.cveID}</link>`));
      assert.ok(item.includes(`<description>${v.shortDescription}</description>`));
      assert.ok(item.includes(`<pubDate>${new Date(v.dateAdded).toUTCString()}</pubDate>`));
    });
  });

  it("describes the channel", async () => {
    mockFetch({ ok: true, json: async () => sampleFeed });

    await updateFeed();
    const xml = getRSS();

    assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
    assert.match(xml, /<title>CISA Catalog of Known Exploited Vulnerabilities<\/title>/);
    assert.ok(xml.includes(`<link>${FEED_URL}</link>`));
    assert.ok(
      xml.includes(
        "<description>CISA KEV catalog – version 2026.07.10 (released 2026-07-10T17:00:25.000Z)</description>",
      ),
    );
    assert.match(xml, /<language>en-US<\/language>/);
    assert.match(xml, /<\/channel>\s*<\/rss>\s*$/);
  });

  it("stamps lastBuildDate with the build time", async () => {
    const now = Date.UTC(2026, 6, 11, 8, 30, 15);
    mock.timers.enable({ apis: ["Date"], now });
    mockFetch({ ok: true, json: async () => sampleFeed });

    await updateFeed();

    assert.ok(getRSS().includes("<lastBuildDate>Sat, 11 Jul 2026 08:30:15 GMT</lastBuildDate>"));
  });
});

describe("tracker request lifecycle", () => {
  afterEach(() => {
    mock.timers.reset();
    mock.restoreAll();
  });

  it("passes an abort signal so a hung request cannot stall updates forever", async () => {
    const fetched = mockFetch({ ok: true, json: async () => sampleFeed });

    await updateFeed();

    const init = fetched.mock.calls[0]?.arguments[1] as RequestInit | undefined;
    assert.ok(init?.signal instanceof AbortSignal, "fetch was called without a signal");
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
