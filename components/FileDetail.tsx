import { detailUrl } from "@/lib/cloudinary";
import AiVerdictSlot from "./AiVerdictSlot";
import type { FileItem } from "@/lib/types";

// 정보창 (기획서 p.4-7): 서브시리즈명 → [F] 제목 → 구분선 → 메타데이터(└ 5필드)
// → 자료 내용 → 원본 이미지(중앙) → AI 판별(예약). SeMA 톤.

function metaFields(file: FileItem) {
  return [
    { label: "등록번호", value: file.fileName },
    { label: "전자여부", value: file.meta.전자여부 },
    { label: "생산일자", value: file.date },
    { label: "형태", value: file.meta.형태 },
    { label: "생산자", value: file.meta.생산자, pill: true },
  ];
}

export default function FileDetail({
  file,
  subseriesName,
}: {
  file: FileItem;
  subseriesName: string;
}) {
  return (
    <article className="mx-auto max-w-3xl px-6 py-10 md:py-14">
      <p className="text-center text-sm text-muted">{subseriesName}</p>
      <h1 className="mt-1 text-center text-2xl font-bold tracking-tight md:text-3xl">
        <span className="text-muted">[F]</span> {file.title ?? file.id}
      </h1>

      <hr className="my-6 border-border" />

      {/* SeMA metadata block — 5 fields with └ markers (기획서 p.5) */}
      <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-3">
        {metaFields(file).map(({ label, value, pill }) => (
          <div key={label} className="flex items-baseline gap-2 text-sm">
            <dt className="shrink-0 text-muted">
              <span aria-hidden className="mr-1">
                └
              </span>
              {label}
            </dt>
            <dd className="min-w-0 flex-1 break-words">
              {value == null ? (
                "—"
              ) : pill ? (
                <span className="inline-block rounded-full border border-border px-2 py-0.5 text-xs">
                  {value}
                </span>
              ) : (
                value
              )}
            </dd>
          </div>
        ))}
      </dl>

      <hr className="my-6 border-border" />

      {file.content && (
        <section className="mb-8">
          <h2 className="mb-2 font-semibold">자료 내용</h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
            {file.content}
          </p>
        </section>
      )}

      {/* 원본 파일 이미지 — 가운데 정렬 (기획서 p.5) */}
      <figure className="my-8 flex justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary already
            optimizes (f_auto/q_auto); intrinsic dims unknown so a plain img avoids
            forcing an aspect ratio. */}
        <img
          src={detailUrl(file.image.publicId, 1600)}
          alt={file.title ?? file.id}
          className="max-h-[78vh] w-auto max-w-full object-contain"
          loading="lazy"
          decoding="async"
        />
      </figure>

      {/* AI 판별 — 보류(자리만) */}
      <AiVerdictSlot />
    </article>
  );
}
