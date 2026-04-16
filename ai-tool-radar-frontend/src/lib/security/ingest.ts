import { createHmac, timingSafeEqual } from "crypto";

export function ingestSecret(): string | null {
  const value = process.env.RADAR_INGEST_SECRET?.trim();
  return value || null;
}

export function signIngestBody(rawBody: string): string {
  const secret = ingestSecret();
  if (!secret) {
    throw new Error("RADAR_INGEST_SECRET is not configured");
  }
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

export function verifyIngestSignature(rawBody: string, headerValue: string | null): boolean {
  if (!headerValue) return false;
  const normalized = headerValue.trim().replace(/^sha256=/i, "");
  if (!normalized) return false;
  const expected = signIngestBody(rawBody);
  const a = Buffer.from(normalized, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyIngestTimestamp(headerValue: string | null, maxSkewSeconds = 300): boolean {
  const n = Number(headerValue || 0);
  if (!Number.isFinite(n) || n <= 0) return false;
  const nowSeconds = Math.floor(Date.now() / 1000);
  return Math.abs(nowSeconds - Math.trunc(n)) <= maxSkewSeconds;
}
