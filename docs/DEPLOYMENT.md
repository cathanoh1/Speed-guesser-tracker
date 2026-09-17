# Deploying

This needs three free accounts (Vercel, Turso, and optionally Microsoft
Teams admin/Power Automate access if you want announcements) and about 15
minutes. Unlike the bot-based version of this app, there's no Azure
resource, no app registration, and no Teams app to sideload - the whole
setup is web hosting plus a database.

## Cost

| Piece | Cost |
|---|---|
| Vercel hosting | Free tier comfortably covers a small group's traffic |
| Turso (database) | Free tier is generous for this scale (a handful of writes a day) |
| Vercel Blob (screenshot storage) | Free tier includes storage and bandwidth well beyond a group's daily screenshots |
| Teams announcements | Free either way (native webhook or Power Automate) |

There is no ongoing per-use API cost in this version - the earlier
Claude-vision screenshot reading has been replaced with plain screenshot
storage, so the whole thing runs at **$0** for a normal-sized friend group
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

## 4. Set the remaining environment variables

In Vercel project settings → **Environment Variables**:

- `TIMEZONE` - your group's IANA timezone, e.g. `Europe/London`. Defaults to
  `Europe/London` if unset.
- `PUBLIC_BASE_URL` - your deployment's URL, e.g.
  `https://speed-guesser-tracker.vercel.app` (no trailing slash). Used to
  build links in Teams announcements.

Redeploy once more so every environment variable is picked up together.

## 5. (Optional) Get announcements into Teams

Set `TEAMS_WEBHOOK_URL` to a URL that accepts a POST of JSON, and the app
will post a card there whenever a game finalizes or a Grand Slam happens.
Skip this entirely if you're happy with everyone just checking the website -
nothing else depends on it.

There are two ways to get that URL, and which one applies depends on
whether your group has a **Team channel** or a bare **group chat**:

### If you have a Team channel

Teams' native **Incoming Webhook** connector is scoped to channels. In the
channel: **⋯ (more options) → Connectors → Incoming Webhook → Configure**,
give it a name, and copy the generated URL into `TEAMS_WEBHOOK_URL`.

### If you only have a group chat

Incoming Webhooks aren't available directly on a plain group chat. Use a
small **Power Automate** flow instead:

1. At [make.powerautomate.com](https://make.powerautomate.com), create an
   **Instant cloud flow** triggered by **"When an HTTP request is received."**
2. Add a **Microsoft Teams → Post message in a chat or channel** action,
   targeting your group chat, with the message text mapped from the
   trigger's request body (e.g. its `text` field).
3. Save the flow - it generates an HTTP POST URL. Put that URL in
   `TEAMS_WEBHOOK_URL`.

Either way, the app doesn't need to know which one you used - both are just
"a URL that accepts a POST of JSON."

## 6. Share the link

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

**Teams announcements aren't showing up.** Double check `TEAMS_WEBHOOK_URL`
is set and that you used the right mechanism for a channel vs. a group chat
(step 5) - a webhook URL from the wrong scope will silently fail. Server
logs (Vercel project → **Logs**) will show the exact POST failure if one
occurred.

**Data resets after a deploy.** This means `TURSO_DATABASE_URL` isn't set -
without it, the app falls back to a local file that doesn't persist across
Vercel's serverless deployments. Double-check step 2.
