import type { DeskRadarItem } from "./desk-api";

export type DeskSection = {
  slug: string;
  title: string;
  blurb: string;
  /** If null, all sources are included. */
  sources: string[] | null;
};

/** Mirrors how the main site groups feeds — Desk-only config. */
export const DESK_SECTIONS: DeskSection[] = [
  {
    slug: "overview",
    title: "Signal overview",
    blurb: "Top trending items across every feed in the last seven days.",
    sources: null,
  },
  {
    slug: "tools",
    title: "Tools desk",
    blurb: "Product launches and repositories — Product Hunt and GitHub.",
    sources: ["ProductHunt", "GitHub"],
  },
  {
    slug: "research",
    title: "Research desk",
    blurb: "New papers and preprints from arXiv.",
    sources: ["arXiv"],
  },
  {
    slug: "community",
    title: "Community desk",
    blurb: "Discussion and links from Hacker News.",
    sources: ["HackerNews"],
  },
];

export const DESK_TRENDING_DAYS = 7;
export const DESK_TRENDING_LIMIT = 25;

export function parseDeskDate(value: string) {
  const ms = new Date(value || "").getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

export function isWithinDeskWindow(published: string, days: number) {
  const ms = parseDeskDate(published);
  if (!ms) return false;
  return Date.now() - ms <= days * 24 * 60 * 60 * 1000;
}

export function itemMatchesDeskSection(item: DeskRadarItem, section: DeskSection) {
  if (section.sources === null) return true;
  return section.sources.includes(item.source);
}

export function trendingForDeskSection(
  items: DeskRadarItem[],
  section: DeskSection,
  days = DESK_TRENDING_DAYS,
  limit = DESK_TRENDING_LIMIT,
) {
  return items
    .filter((i) => itemMatchesDeskSection(i, section))
    .filter((i) => isWithinDeskWindow(i.published_date, days))
    .sort((a, b) => {
      const scoreDiff = Number(b.final_score || 0) - Number(a.final_score || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return parseDeskDate(b.published_date) - parseDeskDate(a.published_date);
    })
    .slice(0, limit);
}

export function getDeskSectionBySlug(slug: string) {
  return DESK_SECTIONS.find((s) => s.slug === slug) ?? null;
}
