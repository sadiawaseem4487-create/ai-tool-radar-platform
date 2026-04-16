#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL?.trim();
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const MIGRATIONS_DIR = path.resolve(process.cwd(), "db/migrations");

async function listMigrationFiles() {
  const entries = await fs.readdir(MIGRATIONS_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".sql"))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));
}

async function main() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
  });
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS radar_schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const files = await listMigrationFiles();
    for (const file of files) {
      const already = await pool.query("SELECT 1 FROM radar_schema_migrations WHERE id = $1 LIMIT 1", [file]);
      if ((already.rowCount || 0) > 0) {
        console.log(`skip ${file}`);
        continue;
      }
      const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      console.log(`apply ${file}`);
      await pool.query("BEGIN");
      try {
        await pool.query(sql);
        await pool.query("INSERT INTO radar_schema_migrations (id) VALUES ($1)", [file]);
        await pool.query("COMMIT");
      } catch (err) {
        await pool.query("ROLLBACK");
        throw err;
      }
    }
    console.log("migrations complete");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(`migration failed: ${err instanceof Error ? err.message : "unknown error"}`);
  process.exit(1);
});
