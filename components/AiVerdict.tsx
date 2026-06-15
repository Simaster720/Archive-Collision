"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { detailUrl } from "@/lib/cloudinary";
import type { AiVerdict as AiVerdictData, VerdictBox } from "@/lib/types";

// AI 판별 카드 (PLAN §3 / D2–D8 · ADR 0003 개정 2026-06-16). 라이트 톤(D3) 안에:
//   ① 상단: "AI 판별" 제목만
//   ② 박스 오버레이 이미지 1장 (확정 디자인 이식 — 흰 글씨/단색 라벨/2px)
//   ③ 판별 근거 (하단): 헤더 행 우측에 요약 %+판정 배지, 그 아래 설명문장 + 근거 리스트
//
// 연출 타임라인(#1·#2): 이미지 onLoad 게이트 → 5초 분석 대기(박스 숨김·"분석 중" 스피너)
//   → 박스 일괄 등장 + 근거 타이핑 + 요약/배지/설명문장 reveal. 박스는 등장 후 고정(이동 없음),
//   조회마다 다른 모양(per-mount 지터)만 유지한다.
// 박스 좌표는 원본 px(지터 전). 지터는 표시 전용이며 데이터에 저장하지 않는다(ADR 0003).

const EDGE_INSET_PX = 8; // 가장자리 박스 안쪽 여유 (CONFIG.edgeInsetPx)
const JITTER_PCT = 1.2; // 좌/우 모서리 독립 최대 ± (이미지 폭 %)
const WIDE_THRESHOLD_PCT = 90; // 이 폭(%) 이상이면 near-full-width
const WIDE_ATTEN = 0.3; // near-full-width 박스 지터 감쇄

// 연출 타이밍 (D6/D7 · ADR 0003 개정). 정밀 튜닝 대상 — 시각 검토로 조정.
const THINK_MS = 5000; // onLoad 후 분석 대기 — 이 동안 박스 숨김, "분석 중" 스피너
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

  // 지터(ADR 0003): 마운트마다 1회 재랜덤 — 조회마다 다른 모양. 등장 후엔 고정(이동 없음).
  const [geoms, setGeoms] = useState<Geom[]>(bases);
  useEffect(() => {
    setGeoms(bases.map(jitter));
  }, [bases]);

  // 이미지 onLoad 게이트(#1): 박스·연출은 이미지가 실제로 페인트된 뒤에만 시작한다.
  // 캐시된 이미지는 onLoad가 안 뜰 수 있어 마운트 시 .complete를 직접 확인한다.
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (imgRef.current?.complete) setLoaded(true);
  }, []);

  // 판별 연출(ADR 0003 개정): onLoad → THINK_MS 분석 대기 → 박스 일괄 등장과 동시에
  // 타이핑 시작. 박스는 stream 동안 연속 이동, done에서 정착. reduced-motion이면 생략.
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
    if (!loaded) return; // 이미지 로드 전 — "분석 중" 스피너 유지, 박스 숨김

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
  }, [boxes, loaded]);

  // 요약 %·판정 배지·설명문장·박스를 같은 시점(박스 등장)에 동시에 드러낸다.
  const revealed = loaded && phase !== "think";

  return (
    <section aria-label="AI 판별" className="mt-10">
      {/* ① 박스 오버레이 이미지 1장 — 박스는 onLoad + THINK_MS 후 일괄 등장 */}
      <div
        className="relative mx-auto w-full overflow-hidden rounded-md bg-neutral-100"
        style={{
          aspectRatio: `${imageWidth} / ${imageHeight}`,
          maxWidth: `${(imageWidth / imageHeight) * 80}vh`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary
            optimizes (f_auto/q_auto); boxes are %-positioned over this frame. */}
        <img
          ref={imgRef}
          src={detailUrl(publicId, 1600)}
          alt={alt}
          className="block h-auto w-full"
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
        />
        {revealed && (
          <div className="pointer-events-none absolute inset-0">
            {boxes.map((b, i) => {
              const g = geoms[i] ?? bases[i];
              return (
                <div
                  key={`${b.label}-${i}`}
                  className="absolute border-2 border-solid"
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
        )}
      </div>

      {/* ② 판별 근거 (하단) — 헤더 행 우측에 요약 %+배지(#3), 아래 설명문장 + 리스트 */}
      <div className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            판별 근거
          </h3>
          {revealed && (
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
          )}
        </div>

        {revealed && (
          <p className="mt-3 text-xs text-muted">
            {isAi
              ? `이 이미지는 ${finalScore}% 정도 생성된 것으로 의심됩니다.`
              : `이 이미지는 실제로 촬영된 것으로 보입니다 (의심도 ${finalScore}%).`}
          </p>
        )}

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
          <ol className="mt-3 divide-y divide-border">
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
