# 🏆 Speed Guesser Tracker

A standalone website that tracks a group's daily **TimeGuesser** and
**Speed Quiz** results. Everyone submits their score with a screenshot as
proof, the site tracks who's still got a score to submit, and once
everyone's in for a game it crowns that day's winner - if the same person
wins both, that's a **Grand Slam**. The leaderboard itself is a page anyone
can open.

There's no login system - you just type your name. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for why, and the tradeoff that
comes with it.

## Features

- **Submit a score with proof** - a simple form: your name, the game, your
  score, and a screenshot of the result. The screenshot is stored and linked
  from the leaderboard so anyone can check it.
- **"Who's still in?"** - the homepage shows who has submitted each game
  today and who hasn't, at a glance.
- **Automatic daily winners** - the moment every active player has a score
  in for a game, that game closes and the winner is shown (ties are handled
  as joint winners). A "Finalize now" button closes it early if someone's
  away and you don't want to wait.
- **Grand Slam** - winning both games on the same day is tracked and called
  out specifically.
- **Shared leaderboard** - always-up-to-date: today's status, all-time
  standings, and recent results, all on one page anyone can open.

## How it works

1. Open the site and go to **Submit a score**.
2. Pick your name (or type a new one to join), choose the game, enter your
   score, and attach a screenshot.
3. The homepage shows who's still needed for each game today.
4. Once everyone active has submitted, that game's winner is shown - and a
   Grand Slam if the same person swept both.
5. The leaderboard shows the all-time standings and recent results, always
   live - just open the link.

## Quick start (local development)

```bash
npm install
npm run dev
```

That's it - with no configuration at all, this runs against a local SQLite
file (via libsql) and works fully for local testing. Screenshot uploads will
fail without a Vercel Blob token configured (see below), which is expected
until you deploy; everything else works immediately.

## Configuration

Copy `.env.example` to `.env.local` and fill in what you have:

| Variable | Required for | Notes |
|---|---|---|
| `TIMEZONE` | Correct day boundaries | An IANA name, e.g. `Europe/London`. Decides when "today" rolls over to "tomorrow" |
| `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` | Persistence in production | A Turso (SQLite-compatible) database. Falls back to a local file when unset - see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |
| `BLOB_READ_WRITE_TOKEN` | Screenshot uploads | Set automatically when you add Vercel Blob storage to your Vercel project |

## Deploying

Full walkthrough, including Turso and Vercel Blob setup:
**[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

## Development

```bash
npm run build              # type-check and build for production
npm test                   # run the unit test suite (vitest)
npm run dev                # run locally with hot reload
npm run generate-icon      # regenerate src/app/icon.png
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit
together and the reasoning behind the roster/finalization/no-login design.

## Project structure

```
src/
  domain/       pure scoring, standings, and finalization logic (fully unit tested)
  db/           libsql (Turso) schema + connection
  lib/          screenshot upload (Vercel Blob)
  app/
    page.tsx      the leaderboard (Server Component, reads data live)
    submit/       the score submission form
    actions.ts    Server Actions: submit a score, join/leave the roster, force-finalize
tests/          vitest unit tests
docs/           architecture notes and the deployment walkthrough
```
