import { itemKey } from "@/lib/radar/triage-store";

export type ToolRow = Record<string, unknown> & {
  id?: string;
  title?: string;
  source?: string;
  category?: string;
  recommended_action?: string;
  published_date?: string;
  final_score?: number | string;
};

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseDateMs(value: unknown): number {
  if (typeof value !== "string" || !value.trim()) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function toolScore(row: ToolRow): number {
  return parseNumber(row.final_score) ?? 0;
}

export function toolDateMs(row: ToolRow): number {
  return parseDateMs(row.published_date);
}

function upstreamUrl(): string {
  const url = process.env.RADAR_UPSTREAM_URL?.trim() || process.env.NEXT_PUBLIC_RADAR_API_URL?.trim();
  if (!url) {
    throw new Error("UPSTREAM_NOT_CONFIGURED");
  }
  return url;
}

export async function fetchToolFeed(): Promise<{
  rows: ToolRow[];
  upstreamMeta?: Record<string, unknown>;
}> {
  const res = await fetch(upstreamUrl(), {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`UPSTREAM_HTTP_${res.status}`);
  }
  const raw: unknown = await res.json();
  if (Array.isArray(raw)) {
    return { rows: raw.filter((x) => x && typeof x === "object") as ToolRow[] };
  }
  if (raw && typeof raw === "object" && "data" in raw && Array.isArray((raw as { data: unknown }).data)) {
    const body = raw as { data: unknown[]; meta?: Record<string, unknown> };
    return {
      rows: body.data.filter((x) => x && typeof x === "object") as ToolRow[],
      upstreamMeta: body.meta,
    };
  }
  throw new Error("INVALID_UPSTREAM_SHAPE");
}

export function getToolId(row: ToolRow): string {
  return itemKey(row);
}
