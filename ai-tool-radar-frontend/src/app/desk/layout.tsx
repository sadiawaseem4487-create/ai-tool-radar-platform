import type { Metadata } from "next";
import Link from "next/link";
import { DESK_SECTIONS } from "@/lib/desk-config";

export const metadata: Metadata = {
  title: "Desk — AI Tool Radar",
  description:
    "Trending AI tools, research, and community links by desk — separate from the main radar page.",
};

export default function DeskLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen border-t-4 border-[var(--accent)] bg-[var(--paper)] text-[var(--ink)]">
      <header className="border-b border-stone-300 bg-[var(--paper-card)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500">AI Tool Radar</p>
            <h1 className="font-headline text-2xl font-bold text-stone-900">Desk</h1>
            <p className="mt-1 max-w-xl text-xs text-stone-600">
              Trending lists by channel. This area is separate from the main front page.
            </p>
          </div>
          <Link
            href="/"
            className="shrink-0 self-start rounded-sm border border-stone-400 bg-white px-3 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50 sm:self-center"
          >
            ← Main radar
          </Link>
        </div>
        <nav className="border-t border-stone-200 bg-stone-100/90">
          <div className="mx-auto flex max-w-6xl flex-wrap gap-1 px-2 py-2 text-xs font-semibold uppercase tracking-wide text-stone-700 sm:gap-2 sm:px-4 sm:text-sm">
            <Link href="/desk" className="rounded px-2 py-1 hover:bg-white">
              Hub
            </Link>
            {DESK_SECTIONS.map((s) => (
              <Link key={s.slug} href={`/desk/${s.slug}`} className="rounded px-2 py-1 hover:bg-white">
                {s.title.replace(" desk", "")}
              </Link>
            ))}
          </div>
        </nav>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</div>
    </div>
  );
}
