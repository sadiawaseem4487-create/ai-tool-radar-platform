import { NextRequest, NextResponse } from "next/server";
import { requestId } from "@/lib/auth/session";
import { writeAudit } from "@/lib/auth/audit";
import { upsertTools } from "@/lib/server/tools-repo";
import { recordIngestBatch, ingestBatchExists } from "@/lib/server/ingest-repo";
import { verifyIngestSignature, verifyIngestTimestamp } from "@/lib/security/ingest";
import { RequestValidationError } from "@/lib/security/request-validation";

export const dynamic = "force-dynamic";

type IngestTool = Record<string, unknown> & {
  id?: string;
  title?: string;
};

function asTrimmed(value: unknown, maxLen: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLen) : "";
}

function jsonError(status: number, code: string, message: string, rid: string, correlationId: string) {
  return NextResponse.json(
    { error: { code, message }, request_id: rid, correlation_id: correlationId },
    { status, headers: { "X-Request-Id": rid, "X-Correlation-Id": correlationId } },
  );
}

function normalizeRows(data: unknown): IngestTool[] {
  if (!Array.isArray(data)) {
    throw new RequestValidationError(400, "VALIDATION_ERROR", "`data` must be an array.");
  }
  const out: IngestTool[] = [];
  const seen = new Set<string>();
  for (const row of data) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const item = row as IngestTool;
    const id = asTrimmed(item.id, 200);
    const title = asTrimmed(item.title, 300);
    if (!id || !title) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ ...item, id, title });
  }
  return out;
}

export async function POST(req: NextRequest) {
  const rid = requestId();
  const correlationId = req.headers.get("x-correlation-id")?.trim() || rid;
  const rawBody = await req.text();

  try {
    if (Buffer.byteLength(rawBody, "utf8") > 1024 * 1024) {
      throw new RequestValidationError(413, "PAYLOAD_TOO_LARGE", "Payload exceeds 1 MB.");
    }
    if (!verifyIngestTimestamp(req.headers.get("x-ingest-timestamp"))) {
      return jsonError(401, "INVALID_INGEST_TIMESTAMP", "Ingest timestamp is missing or expired.", rid, correlationId);
    }
    if (!verifyIngestSignature(rawBody, req.headers.get("x-ingest-signature"))) {
      return jsonError(401, "INVALID_INGEST_SIGNATURE", "Ingest signature verification failed.", rid, correlationId);
    }

    const body = rawBody.trim() ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
    const source = asTrimmed(body.source, 120) || "n8n.tools.feed";
    const batchId = asTrimmed(body.batch_id, 160);
    if (!batchId) {
      throw new RequestValidationError(400, "VALIDATION_ERROR", "`batch_id` is required.");
    }

    const rows = normalizeRows(body.data);
    const batchKey = `${source}:${batchId}`;
    if (await ingestBatchExists(batchKey)) {
      return NextResponse.json(
        {
          data: {
            accepted: true,
            duplicate: true,
            batch_id: batchId,
            rows_received: rows.length,
            rows_upserted: 0,
            rows_skipped: rows.length,
          },
          request_id: rid,
          correlation_id: correlationId,
        },
        { headers: { "X-Request-Id": rid, "X-Correlation-Id": correlationId } },
      );
    }

    await upsertTools(rows);
    await recordIngestBatch({
      batch_key: batchKey,
      source,
      batch_id: batchId,
      request_id: rid,
      rows_received: rows.length,
      rows_upserted: rows.length,
    });
    await writeAudit({
      tenant_id: "tenant_default",
      actor_id: "ingest_webhook",
      action: "ingest.tools.write",
      entity: "tool_feed",
      entity_id: batchId,
      metadata: {
        source,
        batch_id: batchId,
        rows_received: rows.length,
        rows_upserted: rows.length,
        correlation_id: correlationId,
      },
    });

    return NextResponse.json(
      {
        data: {
          accepted: true,
          batch_id: batchId,
          rows_received: rows.length,
          rows_upserted: rows.length,
          rows_skipped: 0,
        },
        request_id: rid,
        correlation_id: correlationId,
      },
      { headers: { "X-Request-Id": rid, "X-Correlation-Id": correlationId } },
    );
  } catch (err) {
    if (err instanceof RequestValidationError) {
      return jsonError(err.status, err.code, err.message, rid, correlationId);
    }
    return jsonError(400, "VALIDATION_ERROR", "Invalid request body.", rid, correlationId);
  }
}
