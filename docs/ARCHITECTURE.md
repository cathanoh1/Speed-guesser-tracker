# Architecture

A Next.js (App Router) app, deployed on Vercel:

```
Browser
  |  GET /                 -> homepage: leaderboard, today's status, roster
  |  GET /submit           -> the submission form
  |  POST (Server Action)  -> submitScore / joinRoster / leaveRoster / forceFinalize
  v
src/app/actions.ts ('use server')
  |-- src/lib/blob.ts          uploads the screenshot to Vercel Blob
  |-- src/domain/store.ts      reads/writes Turso (libsql)
  |-- src/domain/finalize.ts   decides whether a game just closed + who won
  |-- src/lib/teamsWebhook.ts  posts an announcement, if TEAMS_WEBHOOK_URL is set
  v
Turso (libsql) - a single global roster/leaderboard, no per-group scoping
```

Reads (the homepage, the submit page's player list) are plain `async`
Server Components querying the database directly - no separate API layer,
and no caching to fight: Next.js does not cache a plain database call unless
you opt in with `'use cache'`, so the leaderboard is live on every request.

## Why no login

Teams-bot identity was free in the earlier version of this app (Teams itself
guarantees who sent a message). A website has no such guarantee, and this
app deliberately doesn't build real authentication for it: you identify
yourself by typing your name, nothing more. That means someone could type
someone else's name - the mitigation is the **required screenshot**, which
makes every score checkable by anyone looking at the leaderboard, and the
premise that this is a small, trusted friend group rather than a
security-sensitive system. If that stops being true, the natural upgrade
path is OAuth (Microsoft or Google sign-in) gating the submit form, without
needing to change the domain logic at all - `userId` would just come from
the authenticated session instead of a normalized name.

Usernames are normalized (trimmed, lowercased) into a stable key in
`src/domain/username.ts`, so "Cathan" and "cathan" are treated as the same
player while the originally-typed casing is kept as the display name.

## Why Turso instead of a plain file

Vercel's serverless functions have no persistent local disk - a SQLite file
written during one request is gone by the next. Turso is SQLite-compatible
(the `@libsql/client` package), so the schema and nearly all the query code
are exactly what a plain `better-sqlite3` app would look like; the only real
difference is that every call is `async`. Locally (and in tests), the same
code runs against a local file or an in-memory database with zero setup -
see `TURSO_DATABASE_URL` in `.env.example`.

## Finalization

`src/domain/finalize.ts` (`evaluateAndFinalize`) runs after every score
submission. For each game, `computeDailyStatus` (in `src/domain/leaderboard.ts`)
checks whether every *active* player has a score in for that game today; if
so, the highest score wins (ties produce joint winners) and the result is
written once and never recalculated automatically again. A Grand Slam is
checked the same way each time either game finalizes: once *both* games are
finalized for the same day, anyone who's a winner of both is recorded as a
Grand Slam.

The "active roster" is exactly the set of people the status/finalization
logic expects to submit - not everyone who's ever visited the site. A player
joins it the first time they submit a score, or via the "Join roster" form;
"leave" (the ✕ on their chip) opts them back out. Waiting on "everyone" can
stall if someone forgets to leave before going away - the **Finalize now**
button on a stat tile is the manual escape hatch, closing that game with
whatever scores exist so far (`finalizedBy: 'manual'` rather than `'auto'`).

All of this logic lives in `src/domain/` with no dependency on Next.js,
libsql, or Vercel Blob - it's exercised directly in `tests/` against plain
objects and an in-memory (`:memory:`) libsql database.

## Screenshots are proof, not parsed

Every score requires a screenshot, uploaded to Vercel Blob (`src/lib/blob.ts`)
and linked from the "Today's submissions" table on the homepage. Nothing
reads the image or checks the number in it against what was typed - the
screenshot exists so the group itself can spot-check a score if they're
curious, which is a deliberate, much simpler alternative to the previous
version's Claude-vision screenshot parsing. It also means there's no
ongoing per-screenshot API cost.

## Teams announcements (optional)

`src/lib/teamsWebhook.ts` POSTs a plain JSON payload (the classic
[Office 365 "MessageCard"](https://learn.microsoft.com/microsoftteams/platform/webhooks-and-connectors/how-to/connectors-using)
shape) to `TEAMS_WEBHOOK_URL` whenever a game finalizes or a Grand Slam
happens. That URL can be either:

- A native Teams **Incoming Webhook** - simple, but scoped to a **Team
  channel**, not a bare group chat (see docs/DEPLOYMENT.md).
- A **Power Automate** flow's "When an HTTP request is received" trigger,
  relaying into a plain group chat via "Post message in a chat or channel."

Both are just "a URL that accepts a POST of JSON," so nothing in the app
needs to know or care which one is actually configured - and if neither is
set up, announcements are silently skipped (logged, never thrown) without
affecting score submission, which is the feature that actually matters.
