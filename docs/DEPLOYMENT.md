# Deploying

This needs two free accounts (Vercel and Turso) and about 10 minutes. This
is a standalone website with no chat-platform integration, so there's no
Azure resource, no app registration, and nothing to sideload anywhere - the
whole setup is web hosting plus a database.

## Cost

| Piece | Cost |
|---|---|
| Vercel hosting | Free tier comfortably covers a small group's traffic |
| Turso (database) | Free tier is generous for this scale (a handful of writes a day) |
| Vercel Blob (screenshot storage) | Free tier includes storage and bandwidth well beyond a group's daily screenshots |

There is no ongoing per-use API cost - screenshots are stored, not read or
verified by anything, so this runs at **$0** for a normal-sized friend group
on free tiers.

## 1. Deploy to Vercel

Push this repo to GitHub (if it isn't already), then either:

- **Vercel dashboard** (easiest): [vercel.com/new](https://vercel.com/new) →
  import the GitHub repo → deploy. Framework preset auto-detects Next.js.
- **Vercel CLI**: `npx vercel` from the repo root, following the prompts.

The first deploy will work but screenshot uploads and data won't persist
correctly yet - the next two steps fix that.

## 2. Add a Turso database

1. Sign up at [turso.tech](https://turso.tech) (or via `npx turso auth signup`
   if you prefer the CLI - run `turso --help` for the current command set,
   as these can change).
2. Create a database, e.g. `turso db create speed-guesser-tracker`, or via
   the dashboard's "Create Database" button.
3. Get the connection URL: `turso db show speed-guesser-tracker --url`, or
   copy it from the dashboard.
4. Create an auth token: `turso db tokens create speed-guesser-tracker`, or
   from the dashboard.
5. In your Vercel project settings → **Environment Variables**, add:
   - `TURSO_DATABASE_URL` = the URL from step 3
   - `TURSO_AUTH_TOKEN` = the token from step 4

Redeploy (or trigger a new deployment) so the app picks these up. The
database schema is created automatically the first time the app connects -
no separate migration step.

## 3. Add Vercel Blob storage (for screenshots)

In your Vercel project → **Storage** tab → **Create Database** → **Blob**.
Once created and connected to the project, Vercel automatically sets the
`BLOB_READ_WRITE_TOKEN` environment variable - no manual copying needed.

## 4. Set the timezone

In Vercel project settings → **Environment Variables**, add `TIMEZONE` -
your group's IANA timezone, e.g. `Europe/London` (this is what it defaults
to if left unset). Redeploy once more so it's picked up.

## 5. Share the link

Send the deployed URL to your group. `/` is the leaderboard, `/submit` is
where scores go in - link both, or just `/` and let people click through.

## Troubleshooting

**Screenshot uploads fail.** Confirm Vercel Blob storage is added to the
project (step 3) and that the deployment has redeployed since. Screenshots
over 4.5 MB are rejected with a clear message - ask the sender to crop or
recompress.

**Scores land on the wrong day.** Set `TIMEZONE` (step 4) to your group's
actual timezone - it defaults to `Europe/London`.

**A game never finalizes.** It's waiting for every *active* player to
submit - check the roster on the homepage, have the missing person click
their ✕ to leave, or use the **Finalize now** button on that game's tile to
close it with whatever's in so far.

**Data resets after a deploy.** This means `TURSO_DATABASE_URL` isn't set -
without it, the app falls back to a local file that doesn't persist across
Vercel's serverless deployments. Double-check step 2.
