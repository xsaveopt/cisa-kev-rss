const express = require("express");
const cors = require("cors");
const routes = require("./routes");
const tracker = require("./tracker");

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());

tracker.startTracking(10);

app.use("/", routes);

app.listen(port, () => {
  const rssPath = process.env.RSS_PATH || "/rss";
  console.log(`Server listening on port ${port}`);
  console.log(`RSS Feed available at http://localhost:${port}${rssPath}`);
});
