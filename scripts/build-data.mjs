// Build-time data pipeline: data/source/*.xlsx → data/collection.json
//
// Parses the 3 sheets (시리즈) with SheetJS, derives the series/subseries
// hierarchy from the registration filename, and emits a nested tree the
// app consumes for the sidebar / grid / detail views.
//
// Design contract (PLAN §3): swapping the .xlsx and pushing must regenerate
// this JSON with no code changes. So column access is by HEADER NAME (robust
// to column reordering) and a future "서브시리즈명" column is auto-picked up.
//
// Note: SheetJS ESM build does not auto-wire fs — read the bytes ourselves
// and use XLSX.read(buffer) instead of XLSX.readFile (which throws here).

import * as XLSX from "xlsx";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseRegistration } from "./lib/filename.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIR = join(ROOT, "data", "source");
const OUT_FILE = join(ROOT, "data", "collection.json");

const COLLECTION = { code: "C", name: "신수찬 컬렉션" };

// xlsx header (Korean) → field. Absent headers simply yield null.
const COL = {
  fileName: "등록번호(파일명)",
  전자여부: "전자여부",
  date: "생산일자",
  형태: "형태",
  생산자: "생산자",
  content: "자료내용",
  title: "제목",
  subseriesName: "서브시리즈명", // future column; absent today → code fallback
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

// Source of truth is the single .xlsx in data/source. If several exist (e.g. a
// dated drop "…_0614.xlsx" alongside the original), pick deterministically: the
// lexicographically-last name, so a dated suffix wins over the plain name and a
// newer date wins over an older one. Warn so accidental duplicates are visible.
function findWorkbook(dir) {
  const names = readdirSync(dir)
    .filter((n) => n.toLowerCase().endsWith(".xlsx") && !n.startsWith("~$"))
    .sort();
  if (names.length === 0) throw new Error(`No .xlsx found in ${dir}`);
  const chosen = names[names.length - 1];
  if (names.length > 1) {
    console.warn(
      `[build-data] ⚠ ${names.length} .xlsx in ${dir}; using "${chosen}". ` +
        `Keep one source to avoid ambiguity (found: ${names.join(", ")})`,
    );
  }
  return join(dir, chosen);
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
      전자여부: clean(row[COL.전자여부]),
      형태: clean(row[COL.형태]),
      생산자: clean(row[COL.생산자]),
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

function readAllFiles(workbookPath) {
  const wb = XLSX.read(readFileSync(workbookPath), { type: "buffer" });
  const date1904 = Boolean(wb.Workbook?.WBProps?.date1904);
  const formatDate = (value) => formatExcelDate(value, date1904);

  const files = [];
  for (const sheetName of wb.SheetNames) {
    // raw:true keeps date cells as serial numbers so formatExcelDate can
    // normalize them; text cells (incl. already-formatted dates) pass through.
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
      defval: null,
      raw: true,
    });
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

function main() {
  const workbookPath = findWorkbook(SOURCE_DIR);
  const files = dedupeById(readAllFiles(workbookPath));
  const tree = buildTree(files);

  writeFileSync(OUT_FILE, JSON.stringify(tree, null, 2) + "\n", "utf8");
  logSummary(tree);
  console.log(`\n[build-data] wrote ${OUT_FILE}\n`);
}

main();
