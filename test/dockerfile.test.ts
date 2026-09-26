import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { deriveHealthPath } from "../src/routes.ts";

function healthcheckScript(): string {
  const dockerfile = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");
  const match = dockerfile.match(/HEALTHCHECK[^\n]*\\\n\s*CMD (\[.*\])/);
  assert.ok(match?.[1], "HEALTHCHECK CMD not found in Dockerfile");
  const command = JSON.parse(match[1]) as string[];
  assert.deepEqual(command.slice(0, 2), ["node", "-e"]);
  return command[2] ?? "";
}

function runHealthcheck(script: string, env: Record<string, string>): Promise<number> {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, ["-e", script], { env, timeout: 10_000 });
    child.on("exit", (code) => resolve(code ?? -1));
  });
}

describe("Dockerfile HEALTHCHECK", () => {
  const script = healthcheckScript();
  const requested: string[] = [];
  const server = createServer((req, res) => {
    requested.push(req.url ?? "");
    res.statusCode = req.url?.endsWith("/health") ? 200 : 404;
    res.end();
  });
  let port = 0;

  before(async () => {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    port = (server.address() as AddressInfo).port;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const cases = [
    { name: "the default feed path", rssPath: undefined },
    { name: "a custom feed path", rssPath: "/feeds/kev.xml" },
    { name: "a feed path with a trailing slash", rssPath: "/blabla/rss/" },
    { name: "a feed path with several trailing slashes", rssPath: "/a/b/c/rss//" },
  ];

  for (const testCase of cases) {
    it(`probes the same health path as the app for ${testCase.name}`, async () => {
      requested.length = 0;
      const env: Record<string, string> = { PORT: String(port) };
      if (testCase.rssPath !== undefined) {
        env.RSS_PATH = testCase.rssPath;
      }

      const code = await runHealthcheck(script, env);

      assert.equal(code, 0);
      assert.deepEqual(requested, [deriveHealthPath(testCase.rssPath ?? "/rss")]);
    });
  }

  it("fails when the health endpoint is not healthy", async () => {
    const failing = createServer((req, res) => {
      res.statusCode = 503;
      res.end();
    });
    await new Promise<void>((resolve) => failing.listen(0, "127.0.0.1", () => resolve()));
    const failingPort = (failing.address() as AddressInfo).port;

    const code = await runHealthcheck(script, { PORT: String(failingPort) });
    await new Promise<void>((resolve) => failing.close(() => resolve()));

    assert.equal(code, 1);
  });
});
