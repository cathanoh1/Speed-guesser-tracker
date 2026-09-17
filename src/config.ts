import * as dotenv from 'dotenv';

dotenv.config({ quiet: true });

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

const port = parseInt(process.env.PORT || '3978', 10);

export const config = {
  port,
  timezone: process.env.TIMEZONE || 'Europe/London',
  dbPath: process.env.DB_PATH || './data/scores.db',
  publicBaseUrl: stripTrailingSlash(process.env.PUBLIC_BASE_URL || `http://localhost:${port}`),
  bot: {
    appType: process.env.MicrosoftAppType || 'MultiTenant',
    appId: process.env.MicrosoftAppId || '',
    appPassword: process.env.MicrosoftAppPassword || '',
    appTenantId: process.env.MicrosoftAppTenantId || '',
  },
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
};

/** True once an Anthropic API key is configured, enabling screenshot parsing. */
export function isVisionEnabled(): boolean {
  return config.anthropicApiKey.trim().length > 0;
}

/** True once Bot Framework credentials are configured. Without these the bot
 * endpoint will reject Teams traffic, but the leaderboard web UI still works. */
export function isBotConfigured(): boolean {
  return config.bot.appId.trim().length > 0;
}
