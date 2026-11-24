import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

let connection: DatabaseSync | undefined;

export function database() {
  if (connection) return connection;
  const filename = process.env["AYUDATEVECI_DB"] || "data/ayudateveci.sqlite";
  if (filename !== ":memory:") mkdirSync(dirname(resolve(filename)), { recursive: true });
  const db = new DatabaseSync(filename, { enableForeignKeyConstraints: true });
  db.exec("PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;");
  db.exec(readFileSync(resolve("database/schema.sql"), "utf8"));
  connection = db;
  return db;
}

export class LocalError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function transaction<T>(run: (db: DatabaseSync) => T): T {
  const db = database();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = run(db);
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function required<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new LocalError(message, 404);
  return value;
}

export function cents(dollars: number) {
  return Math.round(dollars * 100);
}

export function nowISO() {
  return new Date().toISOString();
}
