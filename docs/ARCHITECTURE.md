# Architecture

One Express process serves three things on one port:

- `POST /api/messages` - the Bot Framework messaging endpoint Teams calls.
- `GET /leaderboard`, `/`, static assets - the shared dashboard.
- `GET /api/*` - the JSON the dashboard (and, in future, anything else) reads.

```
Teams group chat
      |  screenshot / text command, always via the Bot Connector Service
      v
CloudAdapter (botbuilder)  --  onTurnError, Teams auth
      |
SpeedGuesserBot (src/bot/teamsBot.ts)
      |-- commands.ts        parses chat text into a Command
      |-- attachments.ts     downloads a Teams image attachment's bytes
      |-- scoreVisionParser  Claude vision call -> {game, score, confidence}
      |-- cards.ts           builds the Adaptive Cards it sends back
      v
ScoreStore (src/domain/store.ts)  -- thin typed wrapper over SQLite
      ^
      |  same store, same tables
      v
Express web router (src/web/server.ts) -- JSON API + the static dashboard
```

## Why a plain SQLite file

This tracks one friend group's daily game, not a multi-tenant SaaS product -
the realistic write volume is a handful of rows a day. A single `better-sqlite3`
file avoids standing up and paying for a separate database service, is trivial
to back up (copy one file), and is fast enough that every operation in
`ScoreStore` is synchronous. If this ever needs to run as more than one
process behind a load balancer, that's the point at which to move to a
hosted Postgres/MySQL - `ScoreStore` is the only place that would need to
change, since nothing above it knows the storage is SQLite.

## The roster is explicit, not Teams' member list

`status` needs to know who's expected to submit today, so it can say who's
"still needed." The obvious source would be the Teams conversation's member
list (via the Bot Framework/Graph roster APIs) - but that list is *everyone
in the chat*, not everyone who actually plays. In practice, group chats end
up with people who joined for unrelated reasons, people on long-term leave,
etc. Trusting the full member list would leave `status` permanently reporting
people as "missing" who were never going to submit, and would require extra
Graph API permissions to fetch.

Instead, a player becomes part of a conversation's active roster automatically
the moment they submit a score for the first time (screenshot or `score`
command), or explicitly via `join`; `leave` opts back out. That roster is
exactly the set of people `status` and the finalization check care about.

## Finalization

`domain/finalize.ts` (`evaluateAndFinalize`) is called after every score
submission. For each game, it checks `computeDailyStatus` from
`domain/leaderboard.ts`: once every *active* player has a score in for that
game, the game is finalized immediately - the highest score wins (ties
produce joint winners), and the result is written once and never
recalculated automatically again. A Grand Slam is checked the same way,
each time either game finalizes: once *both* games are finalized for the
same day, anyone who's a winner of both is recorded as a Grand Slam.

Waiting on "everyone" can stall forever if someone's away and forgets to
`leave` - the `finalize <game>` command is the manual escape hatch: it closes
a game right now with whatever scores exist, marked `finalizedBy: 'manual'`
rather than `'auto'` in case that distinction is ever useful later (e.g. for
an audit trail or an "unusual result" indicator).

All of this logic lives in `src/domain/` with no dependency on botbuilder,
Express, or the Anthropic SDK - it's exercised directly in `tests/` against
plain objects and an in-memory SQLite database, independent of Teams or any
network call.

## Multi-conversation support

Every table is keyed by `conversation_id` (the Teams conversation/thread ID),
so the bot can be added to more than one group chat with completely
independent rosters, scores, and standings. The dashboard's
`/api/conversations` endpoint lists every conversation the bot has seen; the
page defaults to the only one if there's just one, or offers a simple picker
if there are several. There's no attempt to auto-detect "which chat is this
tab embedded in" via the Teams JS SDK - the explicit picker (remembered per
browser via `localStorage`) is simpler and works identically whether the
page is opened as a plain link or embedded as a tab.

## Screenshot reading

`vision/scoreVisionParser.ts` sends the screenshot to Claude
(`claude-opus-5`) with structured outputs (a Zod schema), asking it to name
the game and extract the final score, along with a confidence level. This is
deliberately not fixed-position OCR: TimeGuesser and Speed Quiz screenshots
vary by theme, crop, and device, and a vision model reading the screen the
way a person would is far more robust to that than pixel-position
extraction. Low-confidence or unparseable results are never auto-recorded -
the bot asks the player to confirm with the `score` command instead of
silently trusting a guess.

## Teams attachment download

Two shapes of Teams attachment exist in practice: files shared via a
file-consent card carry a pre-signed `content.downloadUrl` that needs no
extra auth, while images pasted directly into the compose box carry only
`contentUrl`, which needs the bot's own app token as a bearer credential
(see `bot/attachments.ts`). If screenshot downloads start failing in your
deployment, this is the first place to look - see "Screenshot download
failing" in [DEPLOYMENT.md](DEPLOYMENT.md).
