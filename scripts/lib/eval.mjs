// Build-time reader for the AI-verdict source (data/source/eval_results.xlsx).
//
//   eval_results.xlsx ──XLSX.read──► per-row 특징JSON ──(파일명→id)──► AiVerdict
//
// Produces a Map<id, AiVerdict> the data pipeline merges into file.ai. Robust by
// design (HANDOFF §2.4): a missing file, an unparseable row, or a malformed
// 특징JSON is warned-and-skipped — the build must NEVER break on eval gaps
// (e.g. the HEIC/SS14 rows that have no eval entry → file.ai stays null).

import * as XLSX from "xlsx";
import { readFileSync, existsSync } from "node:fs";
import { featureJsonToVerdict } from "./ai-verdict.mjs";

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

  let skipped = 0;
  for (const row of rows) {
    const fileName = clean(row[COL.fileName]);
    if (!fileName) continue;
    const id = idFromFileName(fileName);

    const feat = parseFeatureJson(row[COL.featureJson]);
    const verdict = feat ? featureJsonToVerdict(feat, row[COL.finalScore]) : null;
    if (!verdict) {
      skipped += 1;
      continue;
    }
    if (!verdicts.has(id)) verdicts.set(id, verdict);
  }

  console.log(
    `[build-data] eval: ${verdicts.size} verdict(s) loaded${
      skipped ? `, ${skipped} row(s) skipped (no/invalid 특징JSON)` : ""
    }.`,
  );
  return verdicts;
}
