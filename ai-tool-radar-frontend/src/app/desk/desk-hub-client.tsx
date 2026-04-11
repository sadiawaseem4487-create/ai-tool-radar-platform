"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchDeskRadarItems, type DeskRadarItem } from "@/lib/desk-api";
import {
  DESK_SECTIONS,
  DESK_TRENDING_DAYS,
  trendingForDeskSection,
} from "@/lib/desk-config";
import { deskTimeAgo } from "@/lib/desk-format";

function itemKey(item: DeskRadarItem) {
  return item.id || item.url || item.title;
}

export default function DeskHubClient() {
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

  if (loading) {
    return <p className="text-sm text-stone-500">Loading desk data…</p>;
  }
  if (error) {
    return (
      <div className="rounded-sm border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="border-b border-stone-200 pb-4">
        <p className="text-sm text-stone-600">
          Each desk shows up to 25 items ranked by score from the last{" "}
          <strong>{DESK_TRENDING_DAYS} days</strong> for that channel. Updated locally: {refreshedAt || "—"}
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {DESK_SECTIONS.map((section) => {
          const trending = trendingForDeskSection(items, section);
          return (
            <section
              key={section.slug}
              className="border border-stone-300 bg-[var(--paper-card)] p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2 border-b border-stone-200 pb-3">
                <div>
                  <h2 className="font-headline text-lg font-bold text-stone-900">{section.title}</h2>
                  <p className="mt-1 text-xs text-stone-600">{section.blurb}</p>
                </div>
                <span className="shrink-0 rounded-sm bg-stone-100 px-2 py-1 text-xs font-medium text-stone-700">
                  {trending.length}
                </span>
              </div>
              <ul className="mt-4 space-y-3">
                {trending.slice(0, 5).map((item) => (
                  <li key={itemKey(item)} className="text-sm">
                    <a
                      href={item.url || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-stone-900 underline-offset-2 hover:text-[var(--accent)] hover:underline"
                    >
                      {item.title}
                    </a>
                    <div className="mt-0.5 flex flex-wrap gap-2 text-[11px] text-stone-500">
                      <span>{item.source}</span>
                      <span>{deskTimeAgo(item.published_date)}</span>
                      <span className="rounded-sm bg-stone-100 px-1.5 py-0.5">
                        {item.final_score}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
              {trending.length === 0 ? (
                <p className="mt-4 text-xs text-stone-500">No items in this window.</p>
              ) : null}
              <Link
                href={`/desk/${section.slug}`}
                className="mt-4 inline-block text-sm font-semibold text-[var(--accent)] hover:underline"
              >
                Open full {section.title.toLowerCase()} →
              </Link>
            </section>
          );
        })}
      </div>
    </div>
  );
}
