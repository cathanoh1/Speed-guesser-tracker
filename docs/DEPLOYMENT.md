# Deploying to Microsoft Teams

This is one-time setup that needs your own Azure subscription and enough
Teams admin rights to sideload (or publish) a custom app - neither of which
this repo can do on your behalf. Budget 30-60 minutes the first time through.

At a high level: **host the app somewhere with a public HTTPS URL → register
an Azure Bot that points at it → package a Teams app manifest → add it to a
group chat.**

## Cost and where to host it

**GitHub itself can't host the running app.** GitHub Pages only serves
static files - it can't run the always-on Node process this needs (to accept
the Bot Framework's POSTs and write to the SQLite file), and GitHub Actions
runs short-lived jobs rather than an always-listening server. The code lives
in this repo; it still needs to be deployed to an actual host - Azure App
Service (pairs naturally with the Azure Bot resource below), Render,
Fly.io, Railway, or your own machine are all fine choices. Whichever you
pick, check that its free/cheap tier gives you a **persistent disk** - some
wipe the filesystem on every restart or redeploy, which would silently reset
the leaderboard.

Realistic cost for a small group:

| Piece | Cost |
|---|---|
| Hosting the app | Often **$0** - traffic for a friend group is a handful of requests a day, well within most free/hobby tiers |
| Azure Bot registration (Teams channel) | No meaningful per-message charge for standard Teams channel usage |
| Screenshot reading (optional) | The one genuine ongoing cost - a real, small Anthropic API call per screenshot on your own account (very roughly a cent or two each at Claude Opus 5's current rates - so a handful of dollars a month for an active group) |
| Everything else | Free - `score timeguesser 42150` works with zero API cost if you skip screenshot reading entirely |

So the floor is $0 if you self-host (or use a free tier) and skip
`ANTHROPIC_API_KEY` - only the screenshot-reading convenience scales with
usage.

## 0. Prerequisites

- An Azure subscription (a free trial works fine for this).
- Rights to upload a custom app to Teams. In many organizations this is
  restricted - if "Upload a custom app" is missing or greyed out for you in
  Teams, ask your Teams admin, or ask them to allow it under **Teams admin
  center → Teams apps → Setup policies**.
- Somewhere to run a small always-on Node.js process with a public HTTPS URL
  and persistent disk (for the SQLite file). Azure App Service is the most
  natural fit alongside an Azure Bot resource; any other Node host (Render,
  Fly.io, a VM) works too as long as it's reachable over HTTPS and the disk
  survives restarts.
- (Optional, for screenshot reading) an Anthropic API key.

## 1. Host the app

Build and run it like any Node service:

```bash
npm install
npm run build
npm start   # runs dist/index.js
```

It needs a persistent volume mounted at wherever `DB_PATH` points (default
`./data/scores.db`) - on most PaaS hosts that means attaching a small disk
and pointing `DB_PATH` at a path inside it, since the container filesystem
itself is usually wiped on redeploy. Note the public HTTPS URL you end up
with (e.g. `https://speed-guesser.azurewebsites.net`) - you'll need it in the
next two steps.

## 2. Register an Azure Bot

1. In the [Azure Portal](https://portal.azure.com), create a new **Azure Bot**
   resource.
2. Choose **Multi Tenant** (or **Single Tenant** if you want it restricted to
   your own organization only - either works, just make sure it matches
   `MicrosoftAppType` in your `.env`).
3. When prompted for an app registration, let Azure create a new one for
   you. Note the generated **Microsoft App ID**.
4. Once created, open the bot resource → **Configuration**:
   - Set **Messaging endpoint** to `https://<your-host>/api/messages`.
5. Under the app registration (Azure Portal → **App registrations** → your
   bot's app) → **Certificates & secrets**, create a new **client secret**
   and copy its value immediately (it's only shown once).
6. Back on the Azure Bot resource → **Channels**, add the **Microsoft Teams**
   channel.

Now fill in your `.env` (or your host's environment variable settings):

```
MicrosoftAppType=MultiTenant        # or SingleTenant, matching step 2
MicrosoftAppId=<the App ID from step 3>
MicrosoftAppPassword=<the client secret from step 5>
MicrosoftAppTenantId=<your tenant ID - required if SingleTenant>
PUBLIC_BASE_URL=https://<your-host>
```

Redeploy/restart the app so it picks up the new environment variables, then
confirm `https://<your-host>/api/messages` is reachable (it should reject a
plain GET/browser request - that's expected, it only accepts authenticated
POSTs from the Bot Connector Service).

## 3. Package and sideload the Teams app

The manifest template lives at `teamsapp/manifest.json`. Edit it first:

- `id` - replace the placeholder GUID with a fresh one (any UUID generator).
- `developer.name` / `websiteUrl` / `privacyUrl` / `termsOfUseUrl` - your
  organization's details (Teams requires these fields to be present; they
  don't need to be publicly meaningful for an internal-only app, but leaving
  Microsoft's docs placeholder text in place at upload time is best avoided).
- `bots[0].botId` - the same Microsoft App ID from step 2.
- `staticTabs[0].contentUrl` and `.websiteUrl` - `https://<your-host>/leaderboard`.
- `validDomains` - `["<your-host>"]` (just the hostname, no `https://`).

Then generate icons (or drop your own `color.png` 192x192 /
`outline.png` 32x32 into `teamsapp/icons/` - see the note below) and package:

```bash
npm run generate-icons       # only needed if you haven't already, or want to regenerate
npm run package-teams-app    # writes teamsapp/teamsapp.zip
```

> The generated icons are a plain placeholder trophy graphic, not branded
> artwork - swap in real `color.png`/`outline.png` files whenever you like;
> `package-teams-app` will zip whatever is in `teamsapp/icons/`.

In Teams: **Apps → Manage your apps → Upload an app → Upload a custom app**,
and pick `teamsapp/teamsapp.zip`. Then add it to the group chat where your
group plays.

If your org has sideloading disabled entirely, the alternative is publishing
it to your org's internal Teams app catalog (**Teams admin center → Teams
apps → Manage apps → Upload new app**), which an admin can do from the same
zip file.

## 4. (Optional) enable screenshot reading

Set `ANTHROPIC_API_KEY` in your environment and redeploy. Without it, the
bot works fully via the `score <game> <points>` text command - this is a
purely additive feature, not a requirement to get the bot running. Note that
each screenshot posted is a real (small) Anthropic API call - a genuine,
ongoing cost on your account, not a one-off.

## 5. Try it

In the group chat, `@mention` the bot with a screenshot or a command, e.g.
`@Speed Guesser Tracker status`. See the troubleshooting notes below if
nothing happens.

---

## Getting the leaderboard visible inside Teams, not just as a link

The manifest ships a **personal-scope** tab, so anyone who opens a 1:1 chat
with the bot gets a "Leaderboard" tab automatically. For a group chat or
channel, Teams' own **"+" → Website** tab (built into every chat/channel,
no manifest changes needed) is the easiest way to pin the same page there:
click **+** at the top of the chat, choose **Website**, and paste
`https://<your-host>/leaderboard`. That's a standard Teams feature, not
something specific to this app.

(A manifest-declared tab that appears automatically in a *group chat* without
that one-time step is possible in Teams via `configurableTabs`, but it needs
a companion configuration page built against the Teams JS SDK. That's
intentionally left out of this repo to avoid shipping an unverified
integration - the Website-tab approach above is simple, requires nothing
extra to maintain, and needs no code changes if you'd rather add it that way
instead.)

## Troubleshooting

**The bot doesn't respond to anything in the group chat.** By default, Teams
only forwards a group chat's messages to a bot when it's **@mentioned** -
this is a Teams platform behavior, not a bug in this bot. Everyone needs to
tag the bot (e.g. `@Speed Guesser Tracker`) when posting a screenshot or a
command. (A 1:1 chat with the bot doesn't need this.)

**Screenshot download failing / "I couldn't download that image."** Teams
serves pasted-in images from an authenticated endpoint that needs the bot's
own token, while files shared via a "file consent" card use a different,
pre-signed URL. `src/bot/attachments.ts` handles both, but this is the one
integration point most sensitive to exact tenant/Teams-client behavior. If
this starts failing consistently, check the Bot Framework's current
attachment-authentication docs and compare against that file - and in the
meantime, `score <game> <points>` always works as a fallback.

**Scores are landing on the wrong day.** Set `TIMEZONE` to your group's IANA
timezone (e.g. `Europe/London`, `America/New_York`) - it defaults to
`Europe/London`. "Today" is computed in that timezone, not the server's
local time or UTC.

**A game never finalizes.** It's waiting for every *active* player to
submit - check `players` to see who's currently on the roster, and either
have the missing person `leave`, or run `finalize <game>` to close it now
with whatever scores are in.

**"Upload a custom app" isn't available in Teams.** Your organization has
sideloading restricted - see the note in step 3 about publishing via the
Teams admin center instead, or ask your Teams admin to allow custom app
uploads.
