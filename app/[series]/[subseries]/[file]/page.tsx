import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import FileDetail from "@/components/FileDetail";
import { allFileParams, findFile } from "@/lib/collection";

// Fully pre-rendered (SSG): one page per file (198).
export const dynamicParams = false;

export function generateStaticParams() {
  return allFileParams();
}

type Params = Promise<{ series: string; subseries: string; file: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { series, subseries, file } = await params;
  const found = findFile(series, subseries, file);
  if (!found) return {};
  return { title: `${found.file.title ?? found.file.id} | 신수찬 컬렉션` };
}

export default async function FilePage({ params }: { params: Params }) {
  const { series, subseries, file } = await params;
  const found = findFile(series, subseries, file);
  if (!found) notFound();

  const { series: s, subseries: sub, file: f } = found;

  return (
    <>
      <nav className="px-6 pt-6 text-sm text-muted md:px-10">
        <Link href={`/${s.code}/${sub.code}`} className="hover:text-link">
          ← {s.name} › {sub.name}
        </Link>
      </nav>
      <FileDetail file={f} subseriesName={sub.name} />
    </>
  );
}
