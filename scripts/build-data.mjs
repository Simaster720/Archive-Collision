// Build-time data pipeline: Google Sheets → data/collection.json
//
// Reads the 3 tabs (시리즈) of the source spreadsheet via the Sheets API v4
// (scripts/lib/sheets.mjs), derives the series/subseries hierarchy from the
// registration filename, and emits a nested tree the app consumes for the
// sidebar / grid / detail views.
//
// Design contract (ADR 0002 / PLAN): the data source is Google Sheets while the
// metadata is in flux; SSG and the derivation rules are untouched. Only the
// input seam changed — column access stays by HEADER NAME (robust to column
// reordering) and the optional "서브시리즈명" column is auto-picked up.
//
// Source-of-truth policy (D4): with GOOGLE_SHEETS_API_KEY set, fetch from the
// sheet (any failure throws → build fails). In CI/Vercel a missing key also
// throws. Locally without a key, keep the committed collection.json (offline).
//
// Note: xlsx is still imported for XLSX.SSF.format (date serial → string).

import * as XLSX from "xlsx";
import { writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseRegistration } from "./lib/filename.mjs";
import { fetchSheetRows } from "./lib/sheets.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_FILE = join(ROOT, "data", "collection.json");

const COLLECTION = { code: "C", name: "신수찬 컬렉션" };

// Sheet header (Korean) → field. Absent headers simply yield null.
const COL = {
  fileName: "등록번호(파일명)",
  date: "생산일자",
  형태: "형태",
  생산자: "생산자",
  분량: "분량",
  content: "자료내용",
  title: "제목",
  subseriesName: "서브시리즈명", // optional column; absent → code fallback
};

const SERIES_NUM = /^S(\d+)$/;
const SUBSERIES_NUM = /^SS(\d+)$/;

/** Empty / whitespace cells normalize to null. */
function clean(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

// 생산일자 cells are mixed: some are real Excel datetimes (serial numbers),
// some are plain text. Normalize both to "yyyy-mm-dd hh:mm:ss" so the UI shows
// one consistent format. SSF.format avoids JS Date timezone drift.
function formatExcelDate(value, date1904) {
  if (value == null) return null;
  if (typeof value === "number") {
    return XLSX.SSF.format("yyyy-mm-dd hh:mm:ss", value, { date1904 });
  }
  return clean(value);
}

/** One spreadsheet row → an internal file record (null for blank rows). */
function rowToFile(row, seriesName, formatDate) {
  const fileName = clean(row[COL.fileName]);
  if (!fileName) return null;

  const { id, ext, seriesCode, subseriesCode, seq, publicId } =
    parseRegistration(fileName);

  return {
    id,
    fileName,
    series: { code: seriesCode, name: seriesName },
    subseries: { code: subseriesCode, name: subseriesCode }, // resolved later
    title: clean(row[COL.title]),
    date: formatDate(row[COL.date]),
    content: clean(row[COL.content]),
    meta: {
      형태: clean(row[COL.형태]),
      생산자: clean(row[COL.생산자]),
      분량: clean(row[COL.분량]),
    },
    image: { publicId, ext },
    ai: null, // ★ reserved — wired to a future AI-verdict xlsx (PLAN §7)
    _seq: seq,
    _subseriesName: clean(row[COL.subseriesName]),
  };
}

/** Strip internal (_*) fields and stamp the resolved subseries name. */
function publicFile(file, subseriesName) {
  return {
    id: file.id,
    fileName: file.fileName,
    series: file.series,
    subseries: { code: file.subseries.code, name: subseriesName },
    title: file.title,
    date: file.date,
    content: file.content,
    meta: file.meta,
    image: file.image,
    ai: file.ai,
  };
}

/** Fetched sheets (tab = 시리즈) → flat internal file records. */
function readFilesFromSheets(sheets, formatDate) {
  const files = [];
  for (const { sheetName, rows } of sheets) {
    for (const row of rows) {
      const file = rowToFile(row, sheetName, formatDate);
      if (file) files.push(file);
    }
  }
  return files;
}

// Same registration number can appear on multiple rows (e.g. a .JPG and a
// .png of the same id). The id (extension-stripped) is the file identity and
// the Cloudinary public_id is identical for both, so we keep the FIRST row and
// warn — never crash the build. This keeps "current xlsx" authoritative while
// tolerating in-progress edits (PLAN: swap-and-push must always build).
function dedupeById(files) {
  const seen = new Map();
  const kept = [];
  const dropped = [];
  for (const f of files) {
    if (seen.has(f.id)) {
      dropped.push({ id: f.id, keptFile: seen.get(f.id), droppedFile: f.fileName });
      continue;
    }
    seen.set(f.id, f.fileName);
    kept.push(f);
  }
  if (dropped.length) {
    console.warn(`\n[build-data] ⚠ dropped ${dropped.length} duplicate id row(s):`);
    for (const d of dropped) {
      console.warn(`    ${d.id}: kept ${d.keptFile}, dropped ${d.droppedFile}`);
    }
  }
  return kept;
}

/** Group flat files into a sorted collection → series → subseries → files tree. */
function buildTree(files) {
  const seriesMap = new Map();
  for (const f of files) {
    if (!seriesMap.has(f.series.code)) {
      seriesMap.set(f.series.code, {
        code: f.series.code,
        name: f.series.name,
        subMap: new Map(),
      });
    }
    const series = seriesMap.get(f.series.code);
    if (!series.subMap.has(f.subseries.code)) {
      series.subMap.set(f.subseries.code, { code: f.subseries.code, name: null, files: [] });
    }
    const sub = series.subMap.get(f.subseries.code);
    if (sub.name == null && f._subseriesName) sub.name = f._subseriesName;
    sub.files.push(f);
  }

  const byNumber = (re) => (a, b) =>
    Number(re.exec(a.code)[1]) - Number(re.exec(b.code)[1]);

  const series = [...seriesMap.values()]
    .sort(byNumber(SERIES_NUM))
    .map((s) => {
      const subseries = [...s.subMap.values()]
        .sort(byNumber(SUBSERIES_NUM))
        .map((sub) => {
          const name = sub.name ?? sub.code; // PLAN §3.3: fallback to code
          const sortedFiles = [...sub.files]
            .sort((a, b) => a._seq - b._seq)
            .map((f) => publicFile(f, name));
          return { code: sub.code, name, fileCount: sortedFiles.length, files: sortedFiles };
        });
      const fileCount = subseries.reduce((n, sub) => n + sub.fileCount, 0);
      return { code: s.code, name: s.name, fileCount, subseriesCount: subseries.length, subseries };
    });

  const subseriesCount = series.reduce((n, s) => n + s.subseriesCount, 0);
  const fileCount = series.reduce((n, s) => n + s.fileCount, 0);

  return {
    collection: COLLECTION,
    totals: { files: fileCount, series: series.length, subseries: subseriesCount },
    series,
  };
}

function logSummary(tree) {
  console.log(`\n[build-data] ${COLLECTION.name}`);
  console.log(
    `  totals: files=${tree.totals.files} series=${tree.totals.series} subseries=${tree.totals.subseries}`,
  );
  for (const s of tree.series) {
    console.log(`  [${s.code}] ${s.name}: ${s.fileCount} files / ${s.subseriesCount} subseries`);
    const counts = s.subseries.map((sub) => `${sub.code}=${sub.fileCount}`).join(" ");
    console.log(`      ${counts}`);
  }
}

async function main() {
  const key = process.env.GOOGLE_SHEETS_API_KEY;
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const isCI = Boolean(process.env.CI || process.env.VERCEL);

  // D4: without a key, CI/Vercel must fail loudly (no silent stale data);
  // local dev falls back to the committed snapshot so offline work isn't blocked.
  if (!key) {
    if (isCI) {
      throw new Error(
        "GOOGLE_SHEETS_API_KEY is required for CI/Vercel builds " +
          "(D4: no silent fallback in production).",
      );
    }
    if (!existsSync(OUT_FILE)) {
      throw new Error(
        `No GOOGLE_SHEETS_API_KEY and no committed ${OUT_FILE} to fall back to. ` +
          "Set GOOGLE_SHEET_ID + GOOGLE_SHEETS_API_KEY in .env.local to fetch from Google Sheets.",
      );
    }
    console.log(
      `[build-data] no GOOGLE_SHEETS_API_KEY — keeping committed collection.json (offline dev).`,
    );
    return;
  }

  // Google Sheets is the source of truth. Dates arrive as 1900-epoch serial
  // numbers (dateTimeRenderOption=SERIAL_NUMBER) → formatExcelDate(v, false).
  const sheets = await fetchSheetRows(sheetId, key);
  const formatDate = (value) => formatExcelDate(value, false);
  const files = dedupeById(readFilesFromSheets(sheets, formatDate));
  const tree = buildTree(files);

  writeFileSync(OUT_FILE, JSON.stringify(tree, null, 2) + "\n", "utf8");
  logSummary(tree);
  console.log(`\n[build-data] wrote ${OUT_FILE} from Google Sheets\n`);
}

main().catch((err) => {
  console.error(`\n[build-data] ✗ ${err.message}\n`);
  process.exit(1);
});
