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
  - Fetches the URL (with existing fetch/timeout infrastructure), extracts title + text sample
  - Calls Claude with a short prompt: given the pipeline descriptions and this content sample, which pipeline fits best and what should the source be named?
  - Returns: `{ name, pipeline_id, rationale, url }`
- The suggest step is separate from the add step — user still confirms before anything is written to DB.
- If fetch fails (e.g. paywalled, JS-rendered), return a fallback response allowing manual categorization.

#### Claude prompt for categorization
- Provide Claude with: the URL, the content sample, and a list of pipeline IDs + their one-line descriptions
- Ask for: best-fit pipeline_id, suggested name (short, no "Blog" suffix unless meaningful), one sentence rationale
- Use a low-temperature call (0.2) for consistent output
- Parse as JSON: `{ pipeline_id, name, rationale }`

## Implementation notes

- `/sources` page is currently auth-gated (via `authMiddleware` on `adminRouter`). Delete and add flows stay behind the same auth.
- The add-source form enforces "one in, one out" at 20: if the chosen pipeline is already at 20, the UI blocks the add and requires the user to delete a source from that pipeline first before the new one can be confirmed. This is not a soft warning — the confirm button is disabled and the message explicitly states a source must be removed.
- Feed discovery (finding the RSS URL) still happens automatically on the next pipeline run, as it does today. The add flow does not need to handle feed URLs — that's already solved.
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
