import { createClient, type Client } from '@libsql/client';
import { config } from '../config';
import { SCHEMA_STATEMENTS } from './schema';

let clientPromise: Promise<Client> | null = null;

/**
 * Returns the shared libsql client (Turso in production, a local file for
 * dev/tests when `TURSO_DATABASE_URL` isn't set), applying the schema the
 * first time it's created in this process. Memoized so repeated calls within
 * one warm serverless instance reuse the same connection.
 */
export function getDb(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const client = createClient({
        url: config.db.url,
        authToken: config.db.authToken || undefined,
      });
      await client.migrate(SCHEMA_STATEMENTS);
      return client;
    })();
  }
  return clientPromise;
}
