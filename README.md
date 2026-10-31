# Svitlo

A personal page with a countdown to the next power on/off change and the outage schedule for queue 5.2 (Poltavaoblenergo). Static files only, no build step, hosted on GitHub Pages.

Data: [OE_OUTAGE_DATA](https://github.com/yaroslav2901/OE_OUTAGE_DATA), refreshed every 3 minutes. All times are computed in `Europe/Kyiv`.

## Run locally

```bash
python -m http.server 5173
```

Then open http://localhost:5173.

## Layout

- `index.html` – the page
- `app/` – page styles and scripts (`common.*` shared layout and schedule rendering, `oval.*` the oval band)
- `shared/schedule.js` – fetching, Kyiv time, half-hour slots, today + tomorrow timeline, mocks
- `shared/theme.js` – light/dark toggle
- `assets/` – WebP textures

Design explorations live in a local `demos/` folder that is not published.

## Testing states

Query parameters:

- `mock=sample|midnight|notomorrow|none|stale|fail` (comma-separated) – replaces live data with fixtures
- `now=2026-10-31T12:40` – fake Kyiv clock that keeps running from this moment
