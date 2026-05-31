const FEED_URL =
  "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";

let currentRSS = "";

function escapeXml(unsafe) {
  if (!unsafe) return "";
  return unsafe.replace(/[<>&'"]/g, function (c) {
    switch (c) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      case '"':
        return "&quot;";
    }
  });
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toUTCString();
}

async function updateFeed() {
  try {
    const response = await fetch(FEED_URL);
    if (!response.ok) {
      console.error(`Failed to fetch CISA feed: ${response.statusText}`);
      return;
    }
    const json = await response.json();

    const catalogVersion = json.catalogVersion;
    const dateReleased = json.dateReleased;
    const now = new Date().toUTCString();

    const items = json.vulnerabilities
      .map((v) => {
        const pubDate = formatDate(v.dateAdded);
        const title = `${v.cveID} – ${escapeXml(v.vulnerabilityName)}`;
        const description = escapeXml(v.shortDescription);

        return `  <item>
    <title>${title}</title>
    <guid isPermaLink="false">${v.cveID}</guid>
    <link>https://nvd.nist.gov/vuln/detail/${v.cveID}</link>
    <description>${description}</description>
    <pubDate>${pubDate}</pubDate>
  </item>`;
      })
      .join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>CISA Catalog of Known Exploited Vulnerabilities</title>
  <link>${FEED_URL}</link>
  <description>CISA KEV catalog – version ${catalogVersion} (released ${dateReleased})</description>
  <lastBuildDate>${now}</lastBuildDate>
  <language>en-US</language>
${items}
</channel>
</rss>`;

    currentRSS = xml;
    console.log(
      `[${new Date().toISOString()}] Feed updated. Version: ${catalogVersion}`,
    );
  } catch (error) {
    console.error("Error updating feed:", error);
  }
}

function startTracking(intervalMinutes) {
  updateFeed();
  setInterval(updateFeed, intervalMinutes * 60 * 1000);
}

function getRSS() {
  return currentRSS;
}

module.exports = {
  startTracking,
  getRSS,
};
