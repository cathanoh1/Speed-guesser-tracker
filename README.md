# 🏆 Speed Guesser Tracker

Tracks a group's daily **TimeGuesser** and **Speed Quiz** results, right from a
Microsoft Teams group chat. Post a screenshot of your result, and the bot reads
the score, tallies it, and tells the group who's still got a score to submit.
Once everyone's in for a game, it crowns that day's winner - and if the same
person wins both games, that's a **Grand Slam**. Every result is kept on a
shared leaderboard anyone can open.

## Features

- **Screenshot scoring** - paste a TimeGuesser or Speed Quiz results screen
  into the chat and the bot reads the score automatically (via Claude's
  vision API). A `score <game> <points>` text command works too, either as a
  primary workflow or a fallback when a screenshot can't be read confidently.
- **"Who's still in?"** - `status` shows who has submitted each game today and
  who hasn't, so no one has to ask.
- **Automatic daily winners** - the moment every active player has a score in
  for a game, that game closes and the bot announces the winner (ties are
  handled as joint winners).
- **Grand Slam** - winning both games on the same day is tracked and called
  out specifically.
- **Shared leaderboard** - an always-up-to-date website (`/leaderboard`) with
  today's status, all-time standings, and recent results - open it directly,
  or add it as a tab/website inside Teams. A `leaderboard` chat command posts
  a summary card with a link to it.
- Works with **multiple** group chats independently if the bot is added to
  more than one (each conversation's roster, scores, and standings are kept
  separate).

## How it works

1. Add the bot to a Teams group chat (see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)).
2. Whoever plays today posts their result screenshot, **@mentioning the bot**
   (Teams only forwards group-chat messages to a bot when it's mentioned -
   see the note in DEPLOYMENT.md if you want to avoid this).
3. The bot replies with the score it read, and asks for a manual entry if it
   isn't confident.
4. `status` any time to see who's left to submit.
5. Once everyone active has a score in for a game, the bot announces the
   winner - and a Grand Slam if the same person swept both games.
6. `leaderboard`, or the `/leaderboard` website, shows the all-time standings.

## Quick start (local development)

```bash
npm install
cp .env.example .env   # fill in as much or as little as you have right now
npm run dev             # starts the server with auto-reload
```

With no configuration at all, the leaderboard website
(`http://localhost:3978/leaderboard`) works immediately - it's just empty
until scores exist. The Teams bot endpoint needs Bot Framework credentials to
accept real Teams traffic, and screenshot reading needs an Anthropic API key;
both are optional for local exploration (see [Configuration](#configuration)).

To test the bot itself without a Teams tenant, run it under the
[Bot Framework Emulator](https://github.com/microsoft/BotFramework-Emulator)
pointed at `http://localhost:3978/api/messages`.

## Chat commands

| Command | What it does |
|---|---|
| *(paste a screenshot)* | Reads the score automatically and records it |
| `score timeguesser 42150` | Logs a TimeGuesser score by hand (aliases: `tg`, `timeguessr`) |
| `score speedquiz 1200` | Logs a Speed Quiz score by hand (alias: `sq`) |
| `tg 42150` | Shorthand for the above - `score` is optional |
| `status` | Shows who's submitted each game today and who's still needed |
| `leaderboard` | Posts the all-time standings, with a link to the full website |
| `join` / `leave` | Opts you in or out of today's roster |
| `players` | Lists everyone currently on the active roster |
| `undo timeguesser` | Removes your own score for today (before it's finalized) |
| `finalize timeguesser` | Closes today's result with whatever scores are in so far - use this if someone's away and you don't want to wait on them |
| `help` | Lists all of the above in the chat |

## Configuration

All configuration is environment variables - see [.env.example](.env.example)
for the full list with comments. The important ones:

| Variable | Required for | Notes |
|---|---|---|
| `PORT` | - | Defaults to `3978` (the Bot Framework convention) |
| `TIMEZONE` | Correct day boundaries | An IANA name, e.g. `Europe/London`. Decides when "today" rolls over to "tomorrow" |
| `DB_PATH` | Persistence | Where the SQLite file is written; the folder is created automatically |
| `PUBLIC_BASE_URL` | Teams tab links, "open full leaderboard" links | The public HTTPS URL this service is deployed at |
| `MicrosoftAppId` / `MicrosoftAppPassword` / `MicrosoftAppTenantId` / `MicrosoftAppType` | The Teams bot | From an Azure Bot resource - see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |
| `ANTHROPIC_API_KEY` | Screenshot reading | Without it, the bot still works fully via the `score` text command |

## Screenshot reading

Screenshots are read with Claude (`claude-opus-5`, Anthropic's vision API) -
each screenshot posted is one API call. This is a genuine, small, ongoing
cost on your own Anthropic account; it isn't free compute. It's also the
most robust option against however TimeGuesser's and your Speed Quiz's
results screens actually look (crops, themes, phone vs. desktop), rather
than a brittle fixed-position OCR. If a screenshot can't be read confidently,
the bot says so and asks for the `score <game> <points>` command instead of
guessing.

## Deploying to Microsoft Teams

That needs an Azure Bot resource, a place to host this app, and a Teams app
package to sideload (or publish) - all one-time setup steps that need your
own Azure/Teams admin access, which is why they're not automated here. Full
walkthrough: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

## Development

```bash
npm run build      # type-check and compile to dist/
npm test           # run the unit test suite (vitest)
npm run dev        # run with auto-reload against src/
npm run generate-icons      # regenerate teamsapp/icons/*.png
npm run package-teams-app   # zip manifest.json + icons into teamsapp/teamsapp.zip
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit
together and the reasoning behind the roster/finalization design.

## Project structure

```
src/
  domain/     pure scoring, standings, and finalization logic (fully unit tested)
  db/         SQLite schema + connection
  vision/     Claude-powered screenshot -> {game, score} extraction
  bot/        Teams bot: commands, attachment download, Adaptive Cards
  web/        leaderboard JSON API + static dashboard
  index.ts    wires it all into one Express server
teamsapp/     Teams app manifest + icons (+ generated teamsapp.zip)
tests/        vitest unit tests
docs/         architecture notes and the deployment walkthrough
```
