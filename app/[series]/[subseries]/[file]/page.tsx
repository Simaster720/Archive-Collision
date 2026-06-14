import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
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
    <section className="p-6 md:p-10">
      <nav className="mb-4 text-sm text-muted">
        <Link href={`/${s.code}/${sub.code}`} className="hover:text-link">
          {s.name} › {sub.name}
        </Link>
      </nav>

      {/* Phase 4 replaces this with FileDetail (image + SeMA metadata 2-col +
          content + AiVerdictSlot). For now: id + title + raw metadata. */}
      <h1 className="text-xl font-semibold tracking-tight">{f.title ?? f.id}</h1>
      <p className="mt-1 text-sm text-muted">{f.id}</p>

      <dl className="mt-6 max-w-xl text-sm">
        {[
          ["등록번호", f.fileName],
          ["생산일자", f.date],
          ["형태", f.meta.형태],
          ["생산자", f.meta.생산자],
          ["전자여부", f.meta.전자여부],
        ].map(([label, value]) => (
          <div key={label} className="flex gap-4 border-b border-border py-2">
            <dt className="w-24 shrink-0 text-muted">{label}</dt>
            <dd className="flex-1">{value ?? "—"}</dd>
          </div>
        ))}
      </dl>

      {f.content && (
        <div className="mt-6 max-w-xl">
          <h2 className="mb-1 text-sm font-medium text-muted">자료내용</h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{f.content}</p>
        </div>
      )}
    </section>
  );
}
