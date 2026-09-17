export const config = {
  /** IANA timezone deciding where one "play day" ends and the next begins. */
  timezone: process.env.TIMEZONE || 'Europe/London',
  db: {
    /** A Turso `libsql://...` URL in production, or a local file for dev/tests. */
    url: process.env.TURSO_DATABASE_URL || 'file:./data/local.db',
    authToken: process.env.TURSO_AUTH_TOKEN || '',
  },
};
