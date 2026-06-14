// One-shot extractor for the AI-verdict bounding-box handoff demo (PLAN §7-A).
//
//   data/source/eval_results.xlsx  ──►  handoff/ai-verdict-demo/data.js
//
// Pulls ONLY the 5 curated target rows (PLAN §3) and emits their 특징JSON
// (image size · scores · 35-feature box array) plus the row-level verdict and
// the deterministic Cloudinary publicId. Output is `window.AI_DEMO_DATA = {…}`
// so the standalone index.html can `<script src="data.js">` it with no build.
//
// This script is RUN ONCE to seed the demo. After handoff the artist edits
// index.html directly — do NOT re-run this to overwrite their design work.
// (Re-running only regenerates data.js, never touches index.html.)
//
// Conventions mirror build-data.mjs: SheetJS ESM can't readFile here, so we
// read bytes ourselves; columns are accessed by Korean HEADER NAME (robust to
// reordering); publicId comes from the shared lib/filename.mjs rule.

import * as XLSX from "xlsx";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseRegistration, CLOUDINARY_ROOT } from "./lib/filename.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_FILE = join(ROOT, "data", "source", "eval_results.xlsx");
const OUT_DIR = join(ROOT, "handoff", "ai-verdict-demo");
const OUT_FILE = join(OUT_DIR, "data.js");

// Portable delivery host: data.js carries the cloud name so the standalone
// HTML builds res.cloudinary.com URLs without env/next-cloudinary (PLAN §4).
const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "dey2my9dg";

// The 5 curated images, in PLAN §3 display order. `why` is carried into data.js
// purely as documentation for the artist (shown in README, not rendered).
const TARGETS = [
  { id: "S3_SS2_05", why: "최고 의심도·무초록 = 최대 경보, 극단 가로비(3.05) 스케일 테스트" },
  { id: "S1_SS1_01", why: "컬렉션 첫 파일, 정사각(1.0), 균형 색" },
  { id: "S2_SS2_04", why: "세로형(0.8), S2, 노랑 우세" },
  { id: "S1_SS8_02", why: "유일한 평온/초록/낮은%(8) 상태, 4K 스케일" },
  { id: "S3_SS3_34", why: "작은 원본(710×531, 박스 가독성), S3" },
];

// xlsx header (Korean) → field. Absent headers simply yield null.
const COL = {
  fileName: "파일명",
  answer: "정답",
  algoScore: "알고리즘점수",
  gptScore: "GPT앙상블점수",
  finalScore: "최종점수",
  judgement: "판정",
  gptVerdict: "GPT판정",
  gptDetail: "GPT상세설명",
  featureJson: "특징JSON",
};

function clean(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

// 특징JSON arrives as a JSON string (or, defensively, an already-parsed object).
function parseFeatureJson(raw, id) {
  if (raw == null) throw new Error(`${id}: 특징JSON is empty`);
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`${id}: 특징JSON is not valid JSON — ${e.message}`);
  }
}

// Keep every feature (all 35) so the demo's showAll/boxCount toggles have the
// full set to curate from. Normalize field order; pass values through untouched.
function normalizeFeature(f) {
  return {
    title: clean(f.title),
    key: clean(f.key),
    x1: f.x1, y1: f.y1, x2: f.x2, y2: f.y2,
    algo_score: f.algo_score ?? null,
    gpt_score: f.gpt_score ?? null,
    ensemble_score: f.ensemble_score ?? null,
    score_pct: f.score_pct ?? null,
    color: clean(f.color),
    description: clean(f.description),
  };
}

function rowToImage(row, target) {
  const fileName = clean(row[COL.fileName]);
  const { id, ext, publicId } = parseRegistration(fileName);
  const feat = parseFeatureJson(row[COL.featureJson], id);

  if (!feat.image || feat.image.width == null || feat.image.height == null) {
    throw new Error(`${id}: 특징JSON.image.{width,height} missing`);
  }
  const features = Array.isArray(feat.features) ? feat.features : [];
  if (features.length === 0) throw new Error(`${id}: no features`);

  return {
    id,
    fileName,
    publicId, // archive-collision/S{n}/SS{n}/{id}
    ext,
    why: target.why,
    image: { width: feat.image.width, height: feat.image.height },
    scores: {
      algo: feat.algo_score ?? null,
      gpt: feat.gpt_score ?? null,
      final: feat.final_score ?? null,
    },
    // Row-level verdict (the human-facing judgement strip).
    verdict: {
      answer: clean(row[COL.answer]), // ground-truth label — always "실제" here
      algoScore: row[COL.algoScore],
      gptScore: row[COL.gptScore],
      finalScore: row[COL.finalScore], // {pct} for the summary template
      judgement: clean(row[COL.judgement]), // 정답 | 오답
      gptVerdict: clean(row[COL.gptVerdict]),
    },
    features: features.map(normalizeFeature),
  };
}

function main() {
  const wb = XLSX.read(readFileSync(SOURCE_FILE), { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });

  const byId = new Map();
  for (const row of rows) {
    const fn = clean(row[COL.fileName]);
    if (!fn) continue;
    const dot = fn.lastIndexOf(".");
    byId.set(dot > 0 ? fn.slice(0, dot) : fn, row);
  }

  const images = TARGETS.map((t) => {
    const row = byId.get(t.id);
    if (!row) throw new Error(`Target ${t.id} not found in ${SOURCE_FILE}`);
    return rowToImage(row, t);
  });

  const payload = {
    cloudName: CLOUD_NAME,
    cloudinaryRoot: CLOUDINARY_ROOT,
    generatedFrom: "data/source/eval_results.xlsx",
    note: "5 curated rows for the AI-verdict box demo. Box coords are ORIGINAL pixels; scale by image.width/height. See README.md.",
    images,
  };

  const banner =
    "// AUTO-GENERATED by scripts/extract-ai-demo-data.mjs — do NOT hand-edit.\n" +
    "// 5 curated rows from data/source/eval_results.xlsx (PLAN §3).\n" +
    "// Box coordinates are ORIGINAL pixels (image.width/height); the demo scales them.\n";
  const body = `window.AI_DEMO_DATA = ${JSON.stringify(payload, null, 2)};\n`;

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, banner + body, "utf8");

  console.log(`[extract-ai-demo] wrote ${OUT_FILE}`);
  for (const img of images) {
    const ar = (img.image.width / img.image.height).toFixed(2);
    const colored = img.features.filter((f) => f.ensemble_score != null);
    const located = colored.filter(
      (f) => !(f.x1 <= 0 && f.y1 <= 0 && f.x2 >= img.image.width && f.y2 >= img.image.height),
    );
    console.log(
      `  ${img.id.padEnd(11)} ${String(img.image.width).padStart(4)}×${String(
        img.image.height,
      ).padEnd(4)} (ar ${ar})  final=${img.verdict.finalScore}% ${img.verdict.judgement}  ` +
        `features=${img.features.length} scored=${colored.length} located=${located.length}`,
    );
  }
  console.log(`  cloudName=${CLOUD_NAME}`);
}

main();
