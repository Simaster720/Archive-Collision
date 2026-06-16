// Build-time reader for the AI-verdict source (data/source/eval_results.xlsx).
//
//   eval_results.xlsx ──XLSX.read──► per-row 특징JSON ──(EXIF 회전 보정)──► AiVerdict
//                                            │
//                                            └─ data/source/orientation.json
//
// Produces a Map<id, AiVerdict> the data pipeline merges into file.ai. Robust by
// design (HANDOFF §2.4): a missing file, an unparseable row, or a malformed
// 특징JSON is warned-and-skipped — the build must NEVER break on eval gaps
// (e.g. the HEIC/SS14 rows that have no eval entry → file.ai stays null).
//
// EXIF orientation (HANDOFF-exif-orientation-crop.md): the eval recorded dims +
// box coords in raw (pre-rotation) space, but Cloudinary serves the EXIF-applied
// image. We rotate the geometry into display space here — applyOrientation is
// applied BEFORE featureJsonToVerdict so selectBoxes curates display-space boxes
// (§5.3). Orientation comes from the committed orientation.json (CI has no
// drive-download originals to read EXIF from — §5.4).

import * as XLSX from "xlsx";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { featureJsonToVerdict } from "./ai-verdict.mjs";
import { applyOrientation } from "./exif-orient.mjs";

const ORIENTATION_FILE = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "data",
  "source",
  "orientation.json",
);

// xlsx header (Korean) → field. Robust to column reordering (by name).
const COL = {
  fileName: "파일명",
  finalScore: "최종점수",
  featureJson: "특징JSON",
};

function clean(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

function idFromFileName(fileName) {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

// 특징JSON is a JSON string (or, defensively, an already-parsed object).
function parseFeatureJson(raw) {
  if (raw == null) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Committed `{ id: orientation 1..8 }` map (scripts/gen-orientation.mjs). Missing
// file → empty map → every id falls back to orientation 1 (no EXIF correction),
// keeping the build green (§5.4 robustness, matches this module's contract).
function loadOrientationMap() {
  try {
    return JSON.parse(readFileSync(ORIENTATION_FILE, "utf8"));
  } catch (err) {
    console.warn(
      `[build-data] ⚠ orientation.json unreadable (${err.message}) — no EXIF correction (all orientation = 1).`,
    );
    return {};
  }
}

// DoD assert (§6): after correction every box must sit inside the display dims.
// An out-of-range box means a coordinate-system mismatch (wrong/absent rotation)
// — surface it loudly per id. 1px tolerance absorbs integer-rounding on edges.
// Returns the violation count so the caller can report a clean (0) build.
function countOutOfRangeBoxes(id, verdict) {
  const { imageWidth: W, imageHeight: H, boxes } = verdict;
  let bad = 0;
  for (const b of boxes) {
    const ok =
      b.x1 >= -1 && b.y1 >= -1 && b.x2 <= W + 1 && b.y2 <= H + 1 && b.x1 <= b.x2 && b.y1 <= b.y2;
    if (!ok) {
      bad += 1;
      console.warn(
        `[build-data] ⚠ ${id}: box "${b.label}" out of range (${b.x1},${b.y1})-(${b.x2},${b.y2}) vs ${W}×${H}`,
      );
    }
  }
  return bad;
}

/**
 * Read the eval workbook and curate one AiVerdict per image id.
 * @param {string} sourceFile absolute path to eval_results.xlsx
 * @returns {Map<string, import("../../lib/types").AiVerdict>}
 */
export function loadEvalVerdicts(sourceFile) {
  const verdicts = new Map();
  if (!existsSync(sourceFile)) {
    console.warn(
      `[build-data] ⚠ eval source not found (${sourceFile}) — all file.ai = null.`,
    );
    return verdicts;
  }

  const wb = XLSX.read(readFileSync(sourceFile), { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });

  const orientation = loadOrientationMap();
  const missingOrientation = new Set();
  let skipped = 0;
  let outOfRange = 0;
  for (const row of rows) {
    const fileName = clean(row[COL.fileName]);
    if (!fileName) continue;
    const id = idFromFileName(fileName);

    const feat = parseFeatureJson(row[COL.featureJson]);
    let verdict = null;
    if (feat) {
      // §5.3: rotate raw → display space BEFORE selectBoxes (inside the verdict).
      // Unknown id → orientation 1 (no-op) + warn (§5.4 default-1).
      const o = orientation[id];
      if (o == null) missingOrientation.add(id);
      verdict = featureJsonToVerdict(applyOrientation(feat, o ?? 1), row[COL.finalScore]);
    }
    if (!verdict) {
      skipped += 1;
      continue;
    }
    outOfRange += countOutOfRangeBoxes(id, verdict);
    if (!verdicts.has(id)) verdicts.set(id, verdict);
  }

  if (missingOrientation.size) {
    const sample = [...missingOrientation].slice(0, 8).join(", ");
    console.warn(
      `[build-data] ⚠ ${missingOrientation.size} id(s) absent from orientation.json — ` +
        `assumed orientation 1 (no EXIF correction): ${sample}${missingOrientation.size > 8 ? " …" : ""}`,
    );
  }
  console.log(
    `[build-data] eval: ${verdicts.size} verdict(s) loaded${
      skipped ? `, ${skipped} row(s) skipped (no/invalid 특징JSON)` : ""
    }${outOfRange ? `, ⚠ ${outOfRange} box(es) out of range` : ", all boxes in range"}.`,
  );
  return verdicts;
}
