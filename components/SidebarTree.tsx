"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { NavTree } from "@/lib/types";

// SeMA-style classification tree. Persistent across routes (rendered in the
// root layout). [C] collection header doubles as the home button (PLAN §6),
// since the global site header is intentionally dropped.

export default function SidebarTree({ tree }: { tree: NavTree }) {
  const pathname = usePathname();
  const [seriesCode, subseriesCode] = pathname.split("/").filter(Boolean);
  const isHome = !seriesCode;

  // Small archive (3 series) → expand all by default; collapse/expand still works.
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(tree.series.map((s) => s.code)),
  );

  function toggle(code: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  return (
    <nav aria-label="컬렉션 분류" className="flex flex-col text-sm">
      {/* [C] collection header = home button, sticky at the top of the sidebar */}
      <Link
        href="/"
        className={`sticky top-0 z-10 border-b border-border bg-background px-4 py-4 font-semibold tracking-tight transition-colors hover:text-link ${
          isHome ? "text-foreground" : "text-foreground/90"
        }`}
      >
        {tree.collection.name}
      </Link>

      <ul className="px-2 py-2">
        {tree.series.map((series) => {
          const expanded = open.has(series.code);
          const seriesActive = series.code === seriesCode;
          return (
            <li key={series.code} className="mb-0.5">
              <button
                type="button"
                onClick={() => toggle(series.code)}
                aria-expanded={expanded}
                className={`flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left transition-colors hover:bg-neutral-100 ${
                  seriesActive ? "font-medium text-foreground" : "text-foreground/80"
                }`}
              >
                <span className="w-3 shrink-0 text-[10px] text-muted">
                  {expanded ? "▾" : "▸"}
                </span>
                <span className="flex-1 truncate">{series.name}</span>
                <span className="shrink-0 text-xs text-muted">{series.fileCount}</span>
              </button>

              {expanded && (
                <ul className="ml-3 border-l border-border pl-2">
                  {series.subseries.map((sub) => {
                    const active =
                      series.code === seriesCode && sub.code === subseriesCode;
                    return (
                      <li key={sub.code}>
                        <Link
                          href={`/${series.code}/${sub.code}`}
                          aria-current={active ? "page" : undefined}
                          className={`flex items-center gap-2 rounded px-2 py-1.5 transition-colors hover:bg-neutral-100 ${
                            active
                              ? "bg-neutral-100 font-medium text-foreground"
                              : "text-foreground/75"
                          }`}
                        >
                          <span className="flex-1 truncate">{sub.name}</span>
                          <span className="shrink-0 text-xs text-muted">
                            {sub.fileCount}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
