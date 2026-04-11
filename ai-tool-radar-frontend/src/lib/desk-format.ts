import { parseDeskDate } from "./desk-config";

export function deskTimeAgo(value: string) {
  const ms = parseDeskDate(value);
  if (!ms) return "unknown time";
  const diff = Date.now() - ms;
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;
  if (diff < hour) return `${Math.max(1, Math.floor(diff / (60 * 1000)))}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  return `${Math.floor(diff / day)}d ago`;
}

export function deskScoreClass(score: number) {
  if (score >= 7) return "bg-green-100 text-green-800";
  if (score >= 6) return "bg-amber-100 text-amber-800";
  return "bg-stone-100 text-stone-700";
}

export function deskActionBadgeClass(action: string) {
  if (action === "Test" || action === "testing") return "bg-green-100 text-green-800";
  if (action === "Watch" || action === "watch") return "bg-amber-100 text-amber-800";
  if (action === "adopted") return "bg-blue-100 text-blue-800";
  if (action === "ignored" || action === "Ignore") return "bg-stone-200 text-stone-700";
  return "bg-stone-100 text-stone-700";
}
