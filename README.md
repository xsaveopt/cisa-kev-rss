# CISA KEV RSS Tracker

A lightweight Node.js service that fetches the [CISA Known Exploited Vulnerabilities (KEV) catalog](https://www.cisa.gov/known-exploited-vulnerabilities-catalog) and serves it as an RSS feed.

## Features

- Fetches CISA KEV catalog every 10 minutes
- Exposes vulnerabilities as an RSS 2.0 feed
- Links each CVE to its NVD detail page
- Lightweight Docker image with multi-stage build

## Quick Start

### Local Development

```bash
npm install
npm run dev
```

The server will start on `http://localhost:3000` with the RSS feed available at `/rss`.

### Docker

```bash
docker build -t cisa-kev-tracker .
docker run -p 3000:3000 cisa-kev-tracker
```

## Configuration

Environment variables:

- `PORT` - Server port (default: `3000`)
- `RSS_PATH` - RSS endpoint path (default: `/rss`)

## Requirements

- Node.js 26
