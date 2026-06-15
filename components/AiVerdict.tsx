"use client";

import { useEffect, useMemo, useState } from "react";
import { detailUrl } from "@/lib/cloudinary";
import type { AiVerdict as AiVerdictData, VerdictBox } from "@/lib/types";

// AI 판별 카드 (PLAN §3 / D2–D8). 라이트 톤(D3) 컨테이너 안에:
//   ① 요약 % + 판정 배지 (상단, 즉시)
//   ② 박스 오버레이 이미지 1장 (확정 디자인 이식 — 흰 글씨/단색 라벨/2px)
//   ③ 판별 근거 리스트 (하단 풀폭)
//
// 박스 좌표는 원본 px(지터 전). 지터는 표시 전용이며 클라이언트에서 매 마운트마다
// 재생성한다(ADR 0003) — 데이터에 저장하지 않는다.

const EDGE_INSET_PX = 8; // 가장자리 박스 안쪽 여유 (CONFIG.edgeInsetPx)
const JITTER_PCT = 1.2; // 좌/우 모서리 독립 최대 ± (이미지 폭 %)
const WIDE_THRESHOLD_PCT = 90; // 이 폭(%) 이상이면 near-full-width
const WIDE_ATTEN = 0.3; // near-full-width 박스 지터 감쇄

// 연출 타이밍 (D6/D7). 정밀 튜닝 대상 — 시각 검토로 조정 가능(PLAN P4).
const THINK_MS = 2000; // 근거 thinking 인디케이터 표시(~2–3초)
const TYPE_MS = 16; // 타이핑 1틱 간격
const TYPE_CHARS = 1; // 틱당 글자 수
const ROW_GAP_MS = 160; // 다음 근거 행으로 넘어가는 간격

type Phase = "think" | "stream" | "done";

type Geom = { left: number; top: number; width: number; height: number };

const r3 = (n: number) => Math.round(n * 1000) / 1000; // sub-pixel, clean markup

// 원본 px → 표시 % (CONFIG.buildBox 와 동일한 가장자리/전폭 보정 포함).
function baseGeom(b: VerdictBox, w: number, h: number): Geom {
  let { x1, y1, x2, y2 } = b;
  if (x1 <= EDGE_INSET_PX) x1 = EDGE_INSET_PX;
  if (y1 <= EDGE_INSET_PX) y1 = EDGE_INSET_PX;
  if (x2 >= w - EDGE_INSET_PX) x2 = w - EDGE_INSET_PX;
  if (y2 >= h - EDGE_INSET_PX) y2 = h - EDGE_INSET_PX;
  if ((x2 - x1) / w > 0.9) {
    x1 = Math.min(w - 20, x1 + 6);
    x2 = Math.max(20, x2 - 6);
  }
  return {
    left: r3((x1 / w) * 100),
    top: r3((y1 / h) * 100),
    width: r3((Math.max(8, x2 - x1) / w) * 100),
    height: r3((Math.max(8, y2 - y1) / h) * 100),
  };
}

// 좌·우 모서리를 각각 독립 ± 변형(높이 고정). near-full-width는 감쇄(ADR 0003).
function jitter(g: Geom): Geom {
  const atten = g.width >= WIDE_THRESHOLD_PCT ? WIDE_ATTEN : 1;
  const dl = (Math.random() * 2 - 1) * JITTER_PCT * atten;
  const dr = (Math.random() * 2 - 1) * JITTER_PCT * atten;
  const left = Math.max(0, Math.min(g.left + dl, 98));
  const right = Math.max(left + 2, Math.min(g.left + g.width + dr, 100));
  return { left: r3(left), top: g.top, width: r3(right - left), height: g.height };
}

export default function AiVerdict({
  verdict,
  publicId,
  alt,
}: {
  verdict: AiVerdictData;
  publicId: string;
  alt: string;
}) {
  const { imageWidth, imageHeight, finalScore, judgement, boxes } = verdict;
  const isAi = judgement === "ai";

  const bases = useMemo(
    () => boxes.map((b) => baseGeom(b, imageWidth, imageHeight)),
    [boxes, imageWidth, imageHeight],
  );

  // 지터는 클라이언트 마운트 후 적용 → SSR/첫 페인트는 원본 좌표(하이드레이션 일치),
  // 직후 매 마운트마다 재랜덤(ADR 0003: 재진입마다 다른 모양).
  const [geoms, setGeoms] = useState<Geom[]>(bases);
  useEffect(() => {
    setGeoms(bases.map(jitter));
  }, [bases]);

  // 근거 연출(D6/D7): thinking ~2초 → 위→아래 순차(행 라벨/% 즉시, 설명 타이핑).
  // 매 마운트 1회·루프 없음. reduced-motion이면 thinking·타이핑 생략 즉시 완성.
  // 박스+요약%는 이 phase와 무관하게 항상 즉시 표시된다.
  const [phase, setPhase] = useState<Phase>("think");
  const [cursor, setCursor] = useState({ row: 0, char: 0 });
  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || boxes.length === 0) {
      setPhase("done");
      return;
    }

    setPhase("think");
    setCursor({ row: 0, char: 0 });
    const timers: ReturnType<typeof setTimeout>[] = [];

    timers.push(
      setTimeout(() => {
        setPhase("stream");
        let row = 0;
        let char = 0;
        const tick = () => {
          const desc = boxes[row]?.description ?? "";
          if (char < desc.length) {
            char = Math.min(desc.length, char + TYPE_CHARS);
            setCursor({ row, char });
            timers.push(setTimeout(tick, TYPE_MS));
          } else if (row + 1 < boxes.length) {
            row += 1;
            char = 0;
            setCursor({ row, char });
            timers.push(setTimeout(tick, ROW_GAP_MS));
          } else {
            setPhase("done");
          }
        };
        timers.push(setTimeout(tick, 0));
      }, THINK_MS),
    );

    return () => timers.forEach(clearTimeout);
  }, [boxes]);

  return (
    <section aria-label="AI 판별" className="mt-10">
      {/* ① 요약 + 판정 배지 (즉시) */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          AI 판별
        </h2>
        <div className="flex items-baseline gap-3">
          <span
            className="font-mono text-2xl font-bold tabular-nums"
            style={{ color: isAi ? "#d11" : "#0a8a4a" }}
          >
            {finalScore}%
          </span>
          <span
            className="rounded-full border px-2.5 py-0.5 text-xs font-medium"
            style={{
              color: isAi ? "#d11" : "#0a8a4a",
              borderColor: isAi ? "#d11" : "#0a8a4a",
            }}
          >
            {isAi ? "AI 생성 의심" : "실제"}
          </span>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted">
        {isAi
          ? `이 이미지는 ${finalScore}% 정도 생성된 것으로 의심됩니다.`
          : `이 이미지는 실제로 촬영된 것으로 보입니다 (의심도 ${finalScore}%).`}
      </p>

      {/* ② 박스 오버레이 이미지 1장 */}
      <div
        className="relative mx-auto mt-4 w-full overflow-hidden rounded-md bg-neutral-100"
        style={{
          aspectRatio: `${imageWidth} / ${imageHeight}`,
          maxWidth: `${(imageWidth / imageHeight) * 80}vh`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary
            optimizes (f_auto/q_auto); boxes are %-positioned over this frame. */}
        <img
          src={detailUrl(publicId, 1600)}
          alt={alt}
          className="block h-auto w-full"
          loading="lazy"
          decoding="async"
        />
        <div className="pointer-events-none absolute inset-0">
          {boxes.map((b, i) => {
            const g = geoms[i] ?? bases[i];
            return (
              <div
                key={`${b.label}-${i}`}
                className="absolute border-2 border-solid transition-[left,width] duration-200 ease-out"
                style={{
                  left: `${g.left}%`,
                  top: `${g.top}%`,
                  width: `${g.width}%`,
                  height: `${g.height}%`,
                  borderColor: b.color,
                }}
              >
                <span
                  className="absolute -left-px -top-px whitespace-nowrap rounded-[3px] px-1.5 py-px font-mono text-[11px] leading-tight text-white"
                  style={{ backgroundColor: b.color }}
                >
                  {b.label} | {b.scorePct}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ③ 판별 근거 (하단 풀폭) — thinking → 위→아래 순차 타이핑 */}
      <div className="mt-6">
        <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted">
          판별 근거
        </h3>

        {phase === "think" ? (
          <div className="flex items-center gap-2 py-3 text-sm text-muted">
            <span aria-hidden className="inline-flex gap-1">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted" />
            </span>
            <span className="animate-pulse">판별 근거를 분석하는 중…</span>
          </div>
        ) : (
          <ol className="divide-y divide-border">
            {boxes.map((b, i) => {
              const done = phase === "done";
              if (!done && i > cursor.row) return null; // 아직 등장 전
              const typing = !done && i === cursor.row;
              const text =
                done || i < cursor.row
                  ? b.description
                  : b.description.slice(0, cursor.char);
              return (
                <li key={`ev-${b.label}-${i}`} className="flex gap-3 py-2.5">
                  <span
                    aria-hidden
                    className="mt-1 h-3.5 w-3.5 shrink-0 rounded-[3px] border border-black/10"
                    style={{ backgroundColor: b.color }}
                  />
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="font-medium text-foreground">
                        {b.titleKo || b.label}
                      </span>
                      <span className="font-mono text-xs tabular-nums text-muted">
                        {b.scorePct}%
                      </span>
                    </div>
                    {b.description && (
                      <p className="mt-0.5 text-sm leading-relaxed text-foreground/75">
                        {text}
                        {typing && (
                          <span
                            aria-hidden
                            className="ml-px inline-block h-3.5 w-0.5 translate-y-0.5 animate-pulse bg-foreground/60 align-middle"
                          />
                        )}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
