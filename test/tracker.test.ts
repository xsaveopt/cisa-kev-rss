import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { getRSS, updateFeed } from "../src/tracker.ts";

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
  mock.method(globalThis, "fetch", async () => response as Response);
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
});
