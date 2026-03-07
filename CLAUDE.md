# robin-digest

## Architecture
Content curation pipeline: discover feeds, fetch content, curate with Claude API, store and serve.
All curation prompts live in `pipelines/*.yaml` — never hardcode prompts in TypeScript.

## UI
Carbon Design System light theme (IBM Plex Sans/Mono, #0f62fe primary, #161616/#f4f4f4).

## Database
Migrations use ALTER TABLE with existence checks — never destructive recreates.

## Transport
HTTP only (no stdio transport). Served via Express.

## Verification
After changes: trigger pipeline manually, check `/digests` and `/dailydirection` pages.

## Commands
- Build: `npm run build`
- Dev: `npm run dev`
- Start: `npm run start`
