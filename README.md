# Meesho Supply Chain Newsroom

A live-style monitor tracking landslides, floods, strikes, festivals/yatras, fuel news, and network shutdowns that affect Last Mile (LM) and First Mile (FM) capacity across India — mapped to Meesho 3P logistics impact (Delhivery, Shadowfax, Xpressbees).

## How it works

Everything on the page is driven by a single data file: **`data/alerts.json`**. There's no build step — it's plain HTML/CSS/JS, so updating the site is just editing that JSON file and pushing to `main`.

## Updating the data

Open `data/alerts.json` and edit:

- `compiledAt` — ISO timestamp shown as "Snapshot compiled on …" in the footer and Today's Snapshot date.
- `upcomingEvents` — the **full year-round festival/observance calendar**, covering all communities (Hindu, Muslim, Christian, Sikh, Jain, and more) plus national holidays — not just the ones currently visible. Fields:
  - `id` — unique slug
  - `icon` — one emoji
  - `community` — e.g. `"Hindu"`, `"Muslim"`, `"Christian"`, `"Sikh"`, `"Jain"`, `"National"`, `"Hindu / Regional harvest"` — informational, not currently shown in the UI but useful for future filtering
  - `title` — headline, ideally naming the operational impact
  - `date` — `YYYY-MM-DD`, the event's start date (or its only day, for single-day events)
  - `endDate` — optional `YYYY-MM-DD`, the last day for multi-day events (e.g. Navratri, Ganesh Chaturthi, Onam, Paryushan). Omit for single-day events.
  - `sources` — array of `{ "name": "Publication", "url": "https://..." }` objects verifying the date (e.g. drikpanchang.com, a panchang site, or a publicholidays.in page). Every event should carry at least one real, checkable source — never fabricate a date or URL. Renders as a small "🔗 Source" link in the Upcoming Events panel.
  - There is no cap on how far out an event's date can be — add the full year's calendar; the site decides on its own when to surface each one (see below).
- `alerts` — the main feed. Each alert:
  - `id` — unique slug (used for anchor links from the situation room)
  - `icon` — an emoji shown as the category icon
  - `title` — headline
  - `category` / `categoryKey` — display label and a short key used for the filter pills (e.g. `"landslide"`, `"strike"`, `"flood"`, `"fuel"`, `"network"`, `"festival"`, `"advisory"`)
  - `severity` — one of `critical`, `high`, `moderate`, `watch`
  - `status` — `ongoing` or `upcoming`
  - `region` — one of `north`, `west`, `south`, `east`, `pan-india` (groups the Regional Impact Zones cards)
  - `states` — array of affected states
  - `date` — `YYYY-MM-DD`
  - `summary` — 2-4 sentence description of the event
  - `impact` — the "Impact on Meesho Ops" callout — what to actually do about it
  - `sources` — array of `{ "name": "Publication", "url": "https://..." }` objects. Each renders as a clickable "Source:" link below the alert that opens the original article in a new tab. (Legacy plain-string sources still render, just without a link.)

Save the file and push to `main` — GitHub Actions rebuilds and redeploys Pages automatically within about a minute.

## Staying current automatically

The dashboard itself does two things to stay fresh without manual reloads:

- **Auto-prune**: any `"status": "ongoing"` alert older than 14 days (see `STALE_DAYS` in `script.js`) is automatically hidden from the feed, so resolved/dead stories don't pile up. `"status": "upcoming"` items are never auto-pruned since they're future-dated.
- **Rolling 15-day festival window**: `upcomingEvents` in the JSON is the full year-round, all-communities calendar. On every load, `script.js` (`computeUpcomingWindow`, `UPCOMING_WINDOW_DAYS`) computes each event's real distance from *today* and only shows it in the Upcoming Events panel once it's ≤15 days away — then keeps it visible for the duration of multi-day events (`date` → `endDate`) and automatically drops it once it's over. This is computed purely from the browser's clock, so it's correct on every page load with no daily editing required — you only need to keep the master calendar stocked a few months ahead.
- **Auto-refresh**: the page re-fetches `data/alerts.json` every 5 minutes while it's open, and again whenever the tab regains focus — so a dashboard left open in a browser tab picks up newly-published data without a manual reload.

On top of that, a scheduled task researches current disruptions and pushes an updated `alerts.json` to `main` daily, so the live site's underlying data also refreshes on its own each day.

## Local preview

Just open `index.html` in a browser, or run a tiny local server (recommended, since some browsers block `fetch()` on local files):

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deployment

This repo ships with `.github/workflows/deploy.yml`, which publishes the site to **GitHub Pages** on every push to `main` using GitHub Actions (no separate hosting needed). Enable it once under **Settings → Pages → Source → GitHub Actions** on the repo, and the site will be live at:

```
https://<your-username>.github.io/<repo-name>/
```

## Disclaimer

This is a manually-refreshed research digest, not a live news-wire feed. Not an official Meesho product.
