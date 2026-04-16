#!/usr/bin/env node

import { Pool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL?.trim();
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const LOOP_INTERVAL_MS = Number(process.env.RADAR_WORKER_POLL_MS || 5000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function claimNext(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS radar_job_queue (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      job_type TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL DEFAULT 'queued',
      attempts INTEGER NOT NULL DEFAULT 0,
      available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  const res = await pool.query(
    `
    WITH candidate AS (
      SELECT id
      FROM radar_job_queue
      WHERE status = 'queued' AND available_at <= NOW()
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE radar_job_queue q
    SET status = 'running', started_at = NOW(), attempts = attempts + 1, updated_at = NOW()
    FROM candidate
    WHERE q.id = candidate.id
    RETURNING q.id, q.tenant_id, q.job_type, q.payload
    `,
  );
  return res.rows[0] || null;
}

async function complete(pool, id) {
  await pool.query(
    "UPDATE radar_job_queue SET status = 'done', finished_at = NOW(), updated_at = NOW(), last_error = NULL WHERE id = $1",
    [id],
  );
}

async function fail(pool, id, message) {
  await pool.query(
    `
    UPDATE radar_job_queue
    SET status = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'queued' END,
        available_at = CASE WHEN attempts >= 3 THEN available_at ELSE NOW() + INTERVAL '30 seconds' END,
        finished_at = CASE WHEN attempts >= 3 THEN NOW() ELSE finished_at END,
        last_error = $2,
        updated_at = NOW()
    WHERE id = $1
    `,
    [id, message],
  );
}

async function runWarmJob(pool, job) {
  const base = process.env.RADAR_WORKER_BASE_URL?.trim() || "http://127.0.0.1:3000";
  const adminCookie = process.env.RADAR_WORKER_COOKIE?.trim();
  if (!adminCookie) {
    throw new Error("RADAR_WORKER_COOKIE is required for tools.warm jobs");
  }
  const res = await fetch(`${base}/api/v1/admin/tools/warm`, {
    method: "POST",
    headers: {
      cookie: adminCookie,
      "x-correlation-id": `worker-${job.id}`,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`warm failed HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
}

async function processJob(pool, job) {
  if (job.job_type === "tools.warm") {
    await runWarmJob(pool, job);
    return;
  }
  throw new Error(`Unsupported job type: ${job.job_type}`);
}

async function main() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
  });
  try {
    console.log(`worker started (poll ${LOOP_INTERVAL_MS}ms)`);
    for (;;) {
      const job = await claimNext(pool);
      if (!job) {
        await sleep(LOOP_INTERVAL_MS);
        continue;
      }
      try {
        await processJob(pool, job);
        await complete(pool, job.id);
        console.log(`job done ${job.id}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Job failed";
        await fail(pool, job.id, message);
        console.error(`job failed ${job.id}: ${message}`);
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(`worker fatal: ${err instanceof Error ? err.message : "unknown error"}`);
  process.exit(1);
});
