import express from "express";
import cors from "cors";
import routes from "./routes.ts";
import { startTracking } from "./tracker.ts";

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());

startTracking(10);

app.use("/", routes);

app.listen(port, () => {
  const rssPath = process.env.RSS_PATH || "/rss";
  console.log(`Server listening on port ${port}`);
  console.log(`RSS Feed available at http://localhost:${port}${rssPath}`);
});
