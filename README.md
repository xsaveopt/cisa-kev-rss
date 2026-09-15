# cisa-kev-rss

A small Node service that turns the [CISA Known Exploited Vulnerabilities catalog](https://www.cisa.gov/known-exploited-vulnerabilities-catalog) into an RSS 2.0 feed.
It fetches the catalog on startup and again every ten minutes, then serves every entry as an item that links to the CVE on the NVD site.
Until the first fetch finishes, the feed path answers with a 503.

## Running

The image is published to GHCR, tagged by version, with latest following the newest release and dev following main.

```sh
docker run -p 3000:3000 ghcr.io/xsaveopt/cisa-kev-rss:latest
```

The feed is then served at /rss on that port.
To run from source you need Node 26 and pnpm, and pnpm dev starts the server with a file watcher after a pnpm install.

## Configuration

| Variable   | Default | Meaning                      |
| ---------- | ------- | ---------------------------- |
| `PORT`     | `3000`  | Port the server listens on   |
| `RSS_PATH` | `/rss`  | Path the feed is served from |

## License

GPL-2.0, see LICENSE.
