import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { allSubseriesParams, findSubseries } from "@/lib/collection";

// Fully pre-rendered (SSG): only the 19 series/subseries pairs exist.
export const dynamicParams = false;

export function generateStaticParams() {
  return allSubseriesParams();
}

type Params = Promise<{ series: string; subseries: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { series, subseries } = await params;
  const found = findSubseries(series, subseries);
  if (!found) return {};
  return { title: `${found.subseries.name} — ${found.series.name} | 신수찬 컬렉션` };
}

export default async function SubseriesPage({ params }: { params: Params }) {
  const { series, subseries } = await params;
  const found = findSubseries(series, subseries);
  if (!found) notFound();

  const { series: s, subseries: sub } = found;

  return (
    <section className="p-6 md:p-10">
      <header className="mb-6">
        <p className="text-sm text-muted">{s.name}</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">{sub.name}</h1>
        <p className="mt-1 text-sm text-muted">{sub.fileCount}개 파일</p>
      </header>

      {/* Phase 4 replaces this with FileGrid (3-col square CldImage thumbnails). */}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {sub.files.map((f) => (
          <li key={f.id}>
            <Link
              href={`/${s.code}/${sub.code}/${f.id}`}
              className="block rounded border border-border p-3 hover:bg-neutral-50"
            >
              <span className="block truncate text-sm font-medium">
                {f.title ?? f.id}
              </span>
              <span className="block truncate text-xs text-muted">{f.id}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
