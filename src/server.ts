import express from "express";
import cors from "cors";
import routes from "./routes.ts";
import { startTracking } from "./tracker.ts";

export function resolvePort(): string | number {
  return process.env.PORT || 3000;
}

export function createApp(): express.Express {
  const app = express();
  app.use(cors());
  app.use("/", routes);
  return app;
}

export function start(port: string | number = resolvePort()) {
  const app = createApp();
  startTracking(10);
  return app.listen(port, () => {
    const rssPath = process.env.RSS_PATH || "/rss";
    console.log(`Server listening on port ${port}`);
    console.log(`RSS Feed available at http://localhost:${port}${rssPath}`);
  });
}

if (import.meta.main) {
  start();
}
