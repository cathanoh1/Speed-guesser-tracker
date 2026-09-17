function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export const config = {
  /** IANA timezone deciding where one "play day" ends and the next begins. */
  timezone: process.env.TIMEZONE || 'Europe/London',
  db: {
    /** A Turso `libsql://...` URL in production, or a local file for dev/tests. */
    url: process.env.TURSO_DATABASE_URL || 'file:./data/local.db',
    authToken: process.env.TURSO_AUTH_TOKEN || '',
  },
  /** A Teams Incoming Webhook URL (or a Power Automate HTTP-trigger URL) to post
   * winner/status announcements to. Optional - see docs/DEPLOYMENT.md. */
  teamsWebhookUrl: process.env.TEAMS_WEBHOOK_URL || '',
  publicBaseUrl: stripTrailingSlash(process.env.PUBLIC_BASE_URL || 'http://localhost:3000'),
};

export function isWebhookConfigured(): boolean {
  return config.teamsWebhookUrl.trim().length > 0;
}
