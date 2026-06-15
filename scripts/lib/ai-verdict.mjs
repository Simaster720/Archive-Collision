// AI-verdict box curation — ported verbatim (logic + constants) from the
// artist-confirmed design in `handoff/ai-verdict-demo/index.html` on origin/main
// (HANDOFF §2.2/§2.3, D2). This runs at BUILD TIME so collection.json carries
// only the curated ~6 boxes; the client just displays + jitters them.
//
// Do NOT redesign here. Color thresholds, the penalty weights, the overlap
// cutoffs, and the label dictionary are the confirmed values — keep them in sync
// with the demo if it ever changes.

// Confirmed CONFIG (origin/main demo). Only the fields the build path needs.
export const CONFIG = {
  boxCount: 6,
  filter: "signal", // signal = drop full-frame boxes, rank by score
  sortBy: "score",
  skipNullScore: true,
  useDataColor: false,
  colorScale: [
    { min: 0.75, color: "#FF1F1F" }, // red
    { min: 0.5, color: "#FF9500" }, // orange
    { min: 0.0, color: "#00E85F" }, // green
  ],
  maxEdgeWideBoxes: 1,
};

const GREY = "#6c7086";

function isFullFrame(f, img) {
  return f.x1 <= 0 && f.y1 <= 0 && f.x2 >= img.width && f.y2 >= img.height;
}

function featureMetrics(f, img) {
  const w = Math.max(1, f.x2 - f.x1);
  const h = Math.max(1, f.y2 - f.y1);
  const wr = w / img.width;
  const hr = h / img.height;
  const area = (w * h) / (img.width * img.height);
  const edgeTouches =
    (f.x1 <= 0 ? 1 : 0) +
    (f.y1 <= 0 ? 1 : 0) +
    (f.x2 >= img.width ? 1 : 0) +
    (f.y2 >= img.height ? 1 : 0);
  const isWide = wr >= 0.9 || hr >= 0.9 || area >= 0.55;
  return { w, h, wr, hr, area, edgeTouches, isWide };
}

function overlapRatio(a, b) {
  const x1 = Math.max(a.x1, b.x1);
  const y1 = Math.max(a.y1, b.y1);
  const x2 = Math.min(a.x2, b.x2);
  const y2 = Math.min(a.y2, b.y2);
  const w = Math.max(0, x2 - x1);
  const h = Math.max(0, y2 - y1);
  const inter = w * h;
  if (!inter) return 0;
  const areaA = Math.max(1, (a.x2 - a.x1) * (a.y2 - a.y1));
  const areaB = Math.max(1, (b.x2 - b.x1) * (b.y2 - b.y1));
  return inter / Math.min(areaA, areaB);
}

export function colorFor(f) {
  if (f.ensemble_score == null) return GREY;
  if (CONFIG.useDataColor && f.color) return f.color;
  for (const stop of CONFIG.colorScale) {
    if (f.ensemble_score >= stop.min) return stop.color;
  }
  return CONFIG.colorScale[CONFIG.colorScale.length - 1].color;
}

const LABEL_DICT = {
  "FFT 주파수 분포": "FFT",
  "블록 분산 균일도": "BLOCK VAR",
  "노이즈 패턴": "NOISE",
  색수차: "CA",
  비네팅: "VIGNETTE",
  "샤프니스 균일도": "SHARPNESS",
  "피부 질감": "SKIN TEX",
  "배경 반복 패턴": "BG REP",
  "텍스트 블러": "TEXT BLUR",
  "EXIF 메타데이터": "EXIF",
  "손가락 이상": "FINGER",
  "얼굴 대칭 분석": "FACE SYM",
  "텍스트 언어 혼용": "TEXT MIX",
  "채도 균일도": "SATURATION",
  "텍스처 엔트로피": "TEX ENT",
  "그레디언트 방향": "GRADIENT",
  "색 번짐": "COLOR BLEED",
  "헤일로 아티팩트": "HALO",
  "엣지 밀도 분포": "EDGE",
  "파일 크기 비율": "FILE SIZE",
  "해상도 패턴": "RESOLUTION",
  "좌우 대칭": "SYMMETRY",
  "로컬 대비 패턴": "CONTRAST",
  "색온도 일관성": "COLOR TEMP",
  "직선 왜곡": "LINE DIST",
  "색 부드러움": "SMOOTH COLOR",
  "배경/전경 복잡도": "FG/BG",
  "깊이감 일관성": "DEPTH",
  "마이크로 텍스처": "MICRO TEX",
  "JPEG 아티팩트": "JPEG",
  "피부 모공 텍스처": "PORE TEX",
  "머리카락 경계": "HAIR EDGE",
  "원근 일관성": "PERSPECTIVE",
  "반사 하이라이트": "HIGHLIGHT",
  "색수차 공간 분포": "CA FIELD",
};

export function shortFeatureLabel(f) {
  const raw = f.title || f.key || "FEATURE";
  if (LABEL_DICT[raw]) return LABEL_DICT[raw];
  return String(raw)
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .slice(0, 18);
}

// Selection pipeline: filter → penalize big/wide/edge boxes → sort by score →
// drop heavy overlaps → cap wide boxes → relax-fill → cut to boxCount.
function selectBoxes(image) {
  const C = CONFIG;
  let list = image.features.map((f, i) => ({ ...f, _srcIndex: i }));
  if (C.skipNullScore) list = list.filter((f) => f.ensemble_score != null);

  if (C.filter === "partial" || C.filter === "signal") {
    list = list.filter((f) => !isFullFrame(f, image.image));
  }

  list = list.map((f) => {
    const m = featureMetrics(f, image.image);
    let penalty = 0;
    if (m.wr > 0.82) penalty += (m.wr - 0.82) * 0.45;
    if (m.hr > 0.82) penalty += (m.hr - 0.82) * 0.35;
    if (m.area > 0.35) penalty += (m.area - 0.35) * 0.6;
    if (m.edgeTouches >= 2) penalty += 0.08;
    return { ...f, _m: m, _rankScore: (f.ensemble_score ?? 0) - penalty };
  });

  const byScore = (a, b) => (b._rankScore ?? -1) - (a._rankScore ?? -1);
  const byOrder = (a, b) => a._srcIndex - b._srcIndex;
  const sorter = C.filter === "signal" || C.sortBy === "score" ? byScore : byOrder;
  list = list.slice().sort(sorter);

  const picked = [];
  let wideCount = 0;
  for (const f of list) {
    if (picked.some((p) => overlapRatio(f, p) > 0.55)) continue;
    if (f._m.isWide && wideCount >= C.maxEdgeWideBoxes) continue;
    picked.push(f);
    if (f._m.isWide) wideCount += 1;
    if (picked.length >= Math.max(0, C.boxCount)) break;
  }

  // Relax overlap if we came up short.
  if (picked.length < C.boxCount) {
    for (const f of list) {
      if (picked.includes(f)) continue;
      if (picked.some((p) => overlapRatio(f, p) > 0.72)) continue;
      picked.push(f);
      if (picked.length >= C.boxCount) break;
    }
  }

  return picked;
}

/**
 * 특징JSON (+ row-level final score fallback) → AiVerdict | null.
 * Returns null only when the image dims or features are unusable, so the
 * caller can fall back to `ai: null` without breaking the build.
 */
export function featureJsonToVerdict(featureJson, fallbackFinalScore) {
  const img = featureJson?.image;
  if (!img || img.width == null || img.height == null) return null;
  const features = Array.isArray(featureJson.features) ? featureJson.features : [];
  if (features.length === 0) return null;

  const rawFinal = featureJson.final_score ?? fallbackFinalScore;
  const finalScore = rawFinal == null ? 0 : Math.round(Number(rawFinal));

  const boxes = selectBoxes({ image: img, features }).map((f) => ({
    label: shortFeatureLabel(f),
    titleKo: f.title ?? "",
    scorePct:
      f.score_pct != null
        ? Number(f.score_pct)
        : Math.round((f.ensemble_score ?? 0) * 100),
    color: colorFor(f),
    description: f.description ?? "",
    x1: f.x1,
    y1: f.y1,
    x2: f.x2,
    y2: f.y2,
  }));

  return {
    imageWidth: img.width,
    imageHeight: img.height,
    finalScore,
    judgement: finalScore >= 50 ? "ai" : "real", // D8
    boxes,
  };
}
