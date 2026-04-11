/** Desk feature only — keeps the main dashboard file unchanged. */

export type DeskRadarItem = {
  id: string;
  title: string;
  source: string;
  category: string;
  published_date: string;
  url: string;
  summary: string;
  lab_relevance: number;
  practicality: number;
  novelty: number;
  final_score: number;
  recommended_action: string;
  why_it_matters: string;
};

export type DeskRadarPayload = {
  data: DeskRadarItem[];
  meta?: {
    generated_at?: string;
    total_rows?: number;
    unique_rows?: number;
    duplicate_rows_removed?: number;
    upsert_key?: string;
    last_collector_run?: string;
  };
};

export async function fetchDeskRadarItems(): Promise<DeskRadarPayload> {
  const url = process.env.NEXT_PUBLIC_RADAR_API_URL;
  if (!url) {
    throw new Error("Missing NEXT_PUBLIC_RADAR_API_URL in .env.local");
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Webhook request failed with status ${response.status}`);
  }

  const data = await response.json();
  if (Array.isArray(data)) {
    return { data };
  }
  if (Array.isArray(data?.data)) {
    return data as DeskRadarPayload;
  }
  throw new Error("Webhook response shape is invalid");
}
