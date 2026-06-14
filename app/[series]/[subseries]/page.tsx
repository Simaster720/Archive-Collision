import type { Metadata } from "next";
import { notFound } from "next/navigation";
import FileGrid from "@/components/FileGrid";
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
        <p className="text-sm text-muted">
          <span className="text-muted/70">[S]</span> {s.name}
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">
          <span className="text-muted">[SS]</span> {sub.name}
        </h1>
        <p className="mt-1 text-sm text-muted">{sub.fileCount}개 파일</p>
      </header>

      <FileGrid files={sub.files} basePath={`/${s.code}/${sub.code}`} />
    </section>
  );
}
