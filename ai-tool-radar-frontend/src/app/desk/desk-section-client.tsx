"use client";

import { useEffect, useState } from "react";
import { fetchDeskRadarItems, type DeskRadarItem } from "@/lib/desk-api";
import {
  DESK_TRENDING_DAYS,
  DESK_TRENDING_LIMIT,
  getDeskSectionBySlug,
  trendingForDeskSection,
} from "@/lib/desk-config";
import { deskActionBadgeClass, deskScoreClass, deskTimeAgo } from "@/lib/desk-format";

function itemKey(item: DeskRadarItem) {
  return item.id || item.url || item.title;
}

type Props = {
  slug: string;
};

export default function DeskSectionClient({ slug }: Props) {
  const section = getDeskSectionBySlug(slug);
  const [items, setItems] = useState<DeskRadarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshedAt, setRefreshedAt] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError("");
        const payload = await fetchDeskRadarItems();
        if (!cancelled) {
          setItems(payload.data || []);
          setRefreshedAt(new Date().toLocaleString());
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!section) return null;

  const trending = trendingForDeskSection(items, section);

  if (loading) {
    return <p className="text-sm text-stone-500">Loading…</p>;
  }
  if (error) {
    return (
      <div className="rounded-sm border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-stone-200 pb-4">
        <p className="text-sm text-stone-700">{section.blurb}</p>
        <p className="mt-2 text-xs text-stone-500">
          Showing up to {DESK_TRENDING_LIMIT} items from the last {DESK_TRENDING_DAYS} days, sorted by
          score. Refreshed: {refreshedAt || "—"}
        </p>
      </div>

      <ol className="space-y-0 divide-y divide-stone-200 border border-stone-300 bg-[var(--paper-card)]">
        {trending.map((item, index) => (
          <li key={itemKey(item)} className="flex gap-4 px-4 py-4 sm:px-5">
            <span className="font-headline w-8 shrink-0 text-2xl font-bold text-stone-300">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <a
                href={item.url || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="font-headline text-base font-semibold text-stone-900 underline-offset-2 hover:text-[var(--accent)] hover:underline"
              >
                {item.title}
              </a>
              {item.summary ? (
                <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-stone-600">{item.summary}</p>
              ) : null}
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-stone-500">
                <span className="font-medium text-stone-700">{item.source}</span>
                <span>{deskTimeAgo(item.published_date)}</span>
                {item.category ? (
                  <span className="rounded-sm border border-stone-200 bg-stone-50 px-2 py-0.5 text-stone-800">
                    {item.category}
                  </span>
                ) : null}
                <span className={`rounded-sm px-2 py-0.5 ${deskScoreClass(Number(item.final_score || 0))}`}>
                  Score {item.final_score}
                </span>
                <span
                  className={`rounded-sm px-2 py-0.5 ${deskActionBadgeClass(item.recommended_action)}`}
                >
                  {item.recommended_action}
                </span>
              </div>
            </div>
          </li>
        ))}
      </ol>

      {trending.length === 0 ? (
        <p className="text-center text-sm text-stone-500">No trending items for this desk in the current window.</p>
      ) : null}
    </div>
  );
}
