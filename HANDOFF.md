# Sources Page Enhancement — Plan

## Features

### 1. Per-category source limit (20 max)

- Enforce a hard cap of 20 sources per pipeline.
- **Display**: Show current count vs limit on `/sources` (e.g. "14 / 20 active"). Visually warn when at or near limit (e.g. amber at 18+, red at 20).
- **Enforcement**: `POST /admin/seed-sources` and the new add-source flow (below) should both reject additions that would exceed the limit, returning a clear error.
- No changes to the DB schema needed — enforce at the application layer.

### 2. Delete sources from /sources UI

- Add a delete button per source row on the `/sources` page.
- Clicking delete posts to `DELETE /admin/delete-source` (already exists) and re-renders the page.
- Should show a simple confirm step (either a JS confirm dialog or an inline "Are you sure?" toggle) to avoid accidental deletions.
- Disabled sources should also be deletable from the UI.

### 3. Add sources from /sources UI with AI-assisted categorization

#### UI flow
1. "Add source" button (per pipeline section, or a single global form at top/bottom).
2. User enters a URL.
3. On submit: server fetches the URL, extracts title + a content sample (first ~500 words or meta description), passes to Claude.
4. Claude returns:
   - Suggested pipeline (from the existing pipeline list)
   - Suggested name (cleaned up from the page title)
   - One-sentence rationale for the categorization
5. Page re-renders showing the suggestion with an editable name field, a pipeline selector (pre-filled with Claude's suggestion), and the rationale as helper text.
6. User confirms (or changes pipeline/name) → source is added via `POST /admin/seed-sources`.

#### Backend
- New route: `POST /admin/suggest-source`
  - Input: `{ url: string }`
  - Runs feed discovery first (reusing existing `feed-finder.ts` logic) — if no feed is found, return a 400 error: "No RSS/Atom feed found. This URL cannot be added as a source."
  - If feed is found: fetch the feed, extract the 3–5 most recent article titles + content snippets (up to 500 chars each)
  - Calls Claude with those article samples to categorize the source
  - Returns: `{ name, pipeline_id, rationale, url, feed_url }`
- The suggest step is separate from the add step — user still confirms before anything is written to DB.
- Feed discovery failure = hard rejection. No fallback to homepage scraping.

#### Claude prompt for categorization
- Provide Claude with: the URL, feed article samples (titles + snippets), and a list of pipeline IDs + their one-line descriptions
- Ask for: best-fit pipeline_id, suggested name (short, no "Blog" suffix unless meaningful), one sentence rationale
- Use a low-temperature call (0.2) for consistent output
- Parse as JSON: `{ pipeline_id, name, rationale }`

## Implementation notes

- `/sources` page is currently auth-gated (via `authMiddleware` on `adminRouter`). Delete and add flows stay behind the same auth.
- The add-source form enforces "one in, one out" at 20: if the chosen pipeline is already at 20, the UI blocks the add and requires the user to delete a source from that pipeline first before the new one can be confirmed. This is not a soft warning — the confirm button is disabled and the message explicitly states a source must be removed.
- Feed discovery happens during `POST /admin/suggest-source`. The `feed_url` returned is stored when the user confirms, so the source is immediately ready to fetch on the next pipeline run.
- Consider adding `POST /admin/suggest-source` to the seed script documentation so it's clear this is an internal tool.

### 4. Flag rarely-updated sources (future, non-urgent)

- On the `/sources` page, surface sources that haven't contributed a new article in the last 30 days with a visual indicator (e.g. a "dormant" tag).
- Query: for each source, find `MAX(a.published_at)` from the articles table. If null (never fetched an article) or older than 30 days, flag it.
- No automated culling — just visibility so the list can be manually reviewed and pruned.
- This pairs naturally with the 20-source cap: dormant sources are wasting a slot.

## Files affected

- `src/routes/admin.ts` — add `POST /admin/suggest-source`, enforce 20-source cap in seed-sources
- `src/ui/sources.html.ts` — add delete buttons, add-source form, suggestion result UI, limit indicators
- No DB schema changes needed

---

# Song of the Day — Implemented

## How it works

Daily direction cron job (3:30 AM CT) generates direction, then runs song recommendation:

1. **MusicBrainz** — Fetches all official releases (singles, albums, EPs) from the last 14 days. Returns ~300 unbiased, unfiltered releases. 3 API calls (one per type), 1 req/sec rate limit respected.
2. **Claude (Sonnet)** — Receives a random sample of 80 releases (title, artist, type, date) plus today's direction suggestions. Picks one based on title connotation and emotional/conceptual resonance. Prompt explicitly favors obscure artists and surprising picks over literal keyword matches or famous names.
3. **Spotify** — Searches for the picked track and returns the Spotify URI (opens the app directly) and album art.
4. **Stored** in `direction_songs` table with token usage for cost tracking.

## Key design decisions

- **Cron only** — Song recommendation does NOT run on manual direction regeneration. Only on the daily cron and via `POST /admin/run-song` for testing.
- **No feedback** — Each day is independent. No thumbs up/down. Without genre data for the obscure artists being recommended, feedback has no meaningful signal for future picks.
- **MusicBrainz for discovery** — Spotify search is popularity-biased. MusicBrainz catalogs everything equally, so obscure releases surface naturally.
- **Release date from MusicBrainz** — Displays the actual single/EP release date, not the Spotify album date which may differ.
- **Spotify URI** — Uses `spotify:track:xxx` URI which opens the Spotify app when installed, rather than the web player.
- **Token cost included** — Song Sonnet call tokens are tracked and included in the per-run cost average in the footer.

## Files

- `src/direction/spotify.ts` — MusicBrainz fetch, Claude pick, Spotify lookup, DB storage
- `src/db.ts` — `direction_songs` table + indexes + token column migration
- `src/http.ts` — Song generation wired into direction cron
- `src/routes/direction.ts` — Song query for display
- `src/routes/admin.ts` — `POST /admin/run-song` for manual testing
- `src/ui/direction.html.ts` — Song card rendering (album art, Spotify link, connection reason)
- `src/config.ts` — `spotifyClientId`, `spotifyClientSecret`
- `scripts/test-spotify.ts` — CLI test script

## Environment variables

- `SPOTIFY_CLIENT_ID` — Spotify app client ID (set in Railway)
- `SPOTIFY_CLIENT_SECRET` — Spotify app client secret (set in Railway)
