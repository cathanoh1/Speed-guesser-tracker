import express from 'express';
import { CloudAdapter, ConfigurationBotFrameworkAuthentication } from 'botbuilder';
import { config, isBotConfigured, isVisionEnabled } from './config';
import { getDb } from './db/client';
import { ScoreStore } from './domain/store';
import { SpeedGuesserBot } from './bot/teamsBot';
import { buildWebRouter } from './web/server';

async function main(): Promise<void> {
  const db = getDb();
  const store = new ScoreStore(db);

  const app = express();
  app.use(express.json());

  // --- Teams bot messaging endpoint ---
  // ConfigurationBotFrameworkAuthentication reads MicrosoftAppType/Id/Password/
  // TenantId straight out of process.env - see docs/DEPLOYMENT.md for how to
  // obtain these from an Azure Bot resource.
  const botFrameworkAuthentication = new ConfigurationBotFrameworkAuthentication(process.env);
  const adapter = new CloudAdapter(botFrameworkAuthentication);
  adapter.onTurnError = async (context, error) => {
    console.error('[onTurnError]', error);
    try {
      await context.sendActivity('Sorry, something went wrong handling that.');
    } catch (sendErr) {
      console.error('[onTurnError] failed to notify the conversation:', sendErr);
    }
  };

  const bot = new SpeedGuesserBot(store);

  app.post('/api/messages', async (req, res) => {
    await adapter.process(req, res, (context) => bot.run(context));
  });

  // --- Leaderboard web UI + JSON API (works even before the bot is configured) ---
  app.use(buildWebRouter(store));

  app.listen(config.port, () => {
    console.log(`Speed Guesser Tracker listening on port ${config.port}`);
    console.log(`Leaderboard: ${config.publicBaseUrl}/leaderboard`);
    console.log(`Bot endpoint: ${config.publicBaseUrl}/api/messages`);
    if (!isBotConfigured()) {
      console.warn(
        'MicrosoftAppId is not set - the Teams bot endpoint will reject traffic until Bot Framework ' +
          'credentials are configured (see docs/DEPLOYMENT.md). The leaderboard website still works.',
      );
    }
    if (!isVisionEnabled()) {
      console.warn(
        'ANTHROPIC_API_KEY is not set - screenshots won’t be read automatically. Players can still ' +
          'log scores with "score timeguesser 42150" / "score speedquiz 1200".',
      );
    }
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
