"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { NavTree } from "@/lib/types";

// SeMA-style classification tree (기획서 p.1-3). Persistent across routes
// (rendered in the root layout). The dark [C] header doubles as the home
// button — it never collapses (PLAN §6 / 기획서: 상시 떠있는 홈 버튼).
//
// Desktop: tree always visible. Mobile: tree is a drawer toggled from the
// header so it doesn't dominate the screen (Phase 5 반응형).

export default function SidebarTree({ tree }: { tree: NavTree }) {
  const pathname = usePathname();
  const [seriesCode, subseriesCode] = pathname.split("/").filter(Boolean);
  const isHome = !seriesCode;

  // Small archive (3 series) → expand all by default; collapse/expand still works.
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(tree.series.map((s) => s.code)),
  );
  const [mobileOpen, setMobileOpen] = useState(false);

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
      {/* [C] dark header = home button (always visible, never collapses) */}
      <div className="sticky top-0 z-10 flex items-stretch bg-neutral-900 text-white">
        <Link
          href="/"
          aria-current={isHome ? "page" : undefined}
          onClick={() => setMobileOpen(false)}
          className="flex flex-1 items-center gap-2 px-4 py-3.5 transition-colors hover:bg-neutral-800"
        >
          <span className="font-semibold tracking-tight">
            <span className="text-white/55">[C]</span> {tree.collection.name}
          </span>
        </Link>
        {/* desktop decorative marker */}
        <span
          aria-hidden
          className="hidden items-center pr-4 text-white/40 md:flex"
        >
          —
        </span>
        {/* mobile drawer toggle */}
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-expanded={mobileOpen}
          aria-label="분류 메뉴 열기/닫기"
          className="px-4 text-white/80 transition-colors hover:bg-neutral-800 md:hidden"
        >
          {mobileOpen ? "✕" : "☰"}
        </button>
      </div>

      <ul className={`${mobileOpen ? "block" : "hidden"} px-2 py-2 md:block`}>
        {tree.series.map((series) => {
          const expanded = open.has(series.code);
          const seriesActive = series.code === seriesCode;
          return (
            <li key={series.code} className="mb-0.5">
              <button
                type="button"
                onClick={() => toggle(series.code)}
                aria-expanded={expanded}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors hover:bg-neutral-100 ${
                  seriesActive ? "font-medium text-foreground" : "text-foreground/85"
                }`}
              >
                <span
                  aria-hidden
                  className="grid h-4 w-4 shrink-0 place-items-center rounded-full border border-neutral-400 text-[10px] leading-none text-neutral-500"
                >
                  {expanded ? "−" : "+"}
                </span>
                <span className="text-xs text-muted">[S]</span>
                <span className="flex-1 truncate">{series.name}</span>
              </button>

              {expanded && (
                <ul className="ml-[1.45rem] border-l border-border pl-2">
                  {series.subseries.map((sub) => {
                    const active = seriesActive && sub.code === subseriesCode;
                    return (
                      <li key={sub.code}>
                        <Link
                          href={`/${series.code}/${sub.code}`}
                          aria-current={active ? "page" : undefined}
                          onClick={() => setMobileOpen(false)}
                          className={`flex items-start gap-1.5 rounded px-2 py-1.5 transition-colors hover:bg-neutral-100 ${
                            active
                              ? "bg-neutral-100 font-medium text-foreground"
                              : "text-foreground/70"
                          }`}
                        >
                          <span className="mt-px shrink-0 text-xs text-muted">
                            [SS]
                          </span>
                          <span className="flex-1 break-keep">{sub.name}</span>
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
