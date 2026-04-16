#!/usr/bin/env node

import { Pool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL?.trim();
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

async function main() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
  });
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS radar_tools (
        tool_id TEXT PRIMARY KEY,
        title TEXT,
        url TEXT,
        source TEXT,
        category TEXT,
        recommended_action TEXT,
        published_date TIMESTAMPTZ,
        final_score DOUBLE PRECISION,
        lifecycle_status TEXT,
        is_recent BOOLEAN NOT NULL DEFAULT FALSE,
        is_hot BOOLEAN NOT NULL DEFAULT FALSE,
        is_discontinued BOOLEAN NOT NULL DEFAULT FALSE,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    const payload = {
      id: "e2e-seed-tool",
      title: "E2E Seed Tool",
      summary: "Seeded tool for CI smoke tests.",
      url: "https://example.com/e2e-seed-tool",
      source: "seed",
      category: "automation",
      recommended_action: "watch",
      published_date: new Date().toISOString(),
      final_score: 8.4,
      lifecycle_status: "recent",
      is_recent: true,
      is_hot: false,
      is_discontinued: false,
    };
    await pool.query(
      `
      INSERT INTO radar_tools (
        tool_id, title, url, source, category, recommended_action, published_date, final_score,
        lifecycle_status, is_recent, is_hot, is_discontinued, payload, updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7::timestamptz,$8,$9,$10,$11,$12,$13::jsonb,NOW())
      ON CONFLICT (tool_id) DO UPDATE SET
        title = EXCLUDED.title,
        url = EXCLUDED.url,
        source = EXCLUDED.source,
        category = EXCLUDED.category,
        recommended_action = EXCLUDED.recommended_action,
        published_date = EXCLUDED.published_date,
        final_score = EXCLUDED.final_score,
        lifecycle_status = EXCLUDED.lifecycle_status,
        is_recent = EXCLUDED.is_recent,
        is_hot = EXCLUDED.is_hot,
        is_discontinued = EXCLUDED.is_discontinued,
        payload = EXCLUDED.payload,
        updated_at = NOW()
      `,
      [
        "e2e-seed-tool",
        payload.title,
        payload.url,
        payload.source,
        payload.category,
        payload.recommended_action,
        payload.published_date,
        payload.final_score,
        payload.lifecycle_status,
        payload.is_recent,
        payload.is_hot,
        payload.is_discontinued,
        JSON.stringify(payload),
      ],
    );
    console.log("seed complete");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(`seed failed: ${err instanceof Error ? err.message : "unknown error"}`);
  process.exit(1);
});
