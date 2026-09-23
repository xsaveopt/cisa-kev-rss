import express, { type Request, type Response } from "express";
import { getRSS } from "./tracker.ts";

const router = express.Router();

export function deriveHealthPath(rssPath: string): string {
  return `${rssPath.replace(/\/+$/, "")}/health`;
}

const rssPath = process.env.RSS_PATH || "/rss";
const healthPath = deriveHealthPath(rssPath);

router.get(healthPath, (req: Request, res: Response) => {
  res.set("Content-Type", "text/plain");
  if (getRSS()) {
    res.status(200).send("up");
  } else {
    res.status(503).send("degraded");
  }
});

router.get(rssPath, (req: Request, res: Response) => {
  try {
    const xml = getRSS();
    if (!xml) {
      res.status(503).send("RSS feed not ready yet");
      return;
    }
    res.set("Content-Type", "application/rss+xml");
    res.send(xml);
  } catch (error) {
    console.error("RSS Error:", error);
    res.status(500).send("Error generating RSS feed");
  }
});

export default router;
