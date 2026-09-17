import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { config } from '../config';
import { SCHEMA_SQL } from './schema';

let db: Database.Database | null = null;

/** Opens (or creates) the shared SQLite database, applying the schema. */
export function getDb(): Database.Database {
  if (db) return db;

  const dir = path.dirname(config.dbPath);
  if (dir && dir !== '.' && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA_SQL);
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
