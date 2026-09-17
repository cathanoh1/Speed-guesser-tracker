import fs from 'node:fs';
import path from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { config } from '../config';
import { SCHEMA_STATEMENTS } from './schema';

let clientPromise: Promise<Client> | null = null;

/** For a local `file:./data/local.db`-style URL, make sure its directory exists first. */
function ensureLocalFileDirExists(url: string): void {
  if (!url.startsWith('file:')) return;
  const filePath = url.slice('file:'.length);
  if (filePath === ':memory:') return;
  const dir = path.dirname(filePath);
  if (dir && dir !== '.') {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Returns the shared libsql client (Turso in production, a local file for
 * dev/tests when `TURSO_DATABASE_URL` isn't set), applying the schema the
 * first time it's created in this process. Memoized so repeated calls within
 * one warm serverless instance reuse the same connection.
 */
export function getDb(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = (async () => {
      ensureLocalFileDirExists(config.db.url);
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
