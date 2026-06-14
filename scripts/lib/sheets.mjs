// Build-time data source: Google Sheets API v4 (read-only, API key).
//
// This module is the single seam that replaces XLSX byte-reading. It mirrors
// the SheetJS path's output shape so build-data.mjs's downstream pipeline
// (rowToFile / dedupeById / buildTree) is reused unchanged.
//
// Contract (PLAN §2 / HANDOFF §2):
//  - discover tab titles → each tab = one 시리즈 (탭명 = 시리즈명).
//  - batchGet every tab with UNFORMATTED_VALUE + SERIAL_NUMBER so date cells
//    arrive as 1900-epoch serial numbers; formatExcelDate(v, false) normalizes
//    them exactly as it did for .xlsx (Google Sheets = 1900 epoch).
//  - convert each value matrix (row 0 = header) into header-keyed row objects,
//    null-padding short rows so every header key is present (matches the old
//    sheet_to_json({ defval: null }) output).
//  - any failure throws with a clear message → CI/Vercel build fails (D4: no
//    silent stale fallback in production).

const API = "https://sheets.googleapis.com/v4/spreadsheets";

/** GET a Sheets API endpoint as JSON, turning any failure into a clear throw. */
async function getJson(url, what) {
  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    throw new Error(`[sheets] network error while ${what}: ${e.message}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `[sheets] ${what} failed: HTTP ${res.status} ${res.statusText}` +
        (body ? ` — ${body.slice(0, 300)}` : ""),
    );
  }
  return res.json();
}

/** Value matrix (row 0 = header) → array of header-keyed row objects. */
function matrixToRows(values) {
  if (!values || values.length === 0) return [];
  const [header, ...body] = values;
  const keys = header.map((h) => String(h).trim());
  return body.map((row) => {
    const obj = {};
    keys.forEach((key, i) => {
      const cell = row[i];
      obj[key] = cell === undefined ? null : cell;
    });
    return obj;
  });
}

/**
 * Fetch every tab of a spreadsheet as header-keyed rows.
 * @param {string} sheetId  spreadsheet id (from the sheet URL `/d/{id}/`)
 * @param {string} apiKey   GCP API key restricted to the Sheets API
 * @returns {Promise<Array<{ sheetName: string, rows: object[] }>>}
 * @throws on missing args or any API failure (build must fail loudly).
 */
export async function fetchSheetRows(sheetId, apiKey) {
  if (!sheetId) throw new Error("[sheets] GOOGLE_SHEET_ID is not set");
  if (!apiKey) throw new Error("[sheets] GOOGLE_SHEETS_API_KEY is not set");

  const key = encodeURIComponent(apiKey);

  // 1) discover tab titles (= 시리즈명), in sheet order.
  const meta = await getJson(
    `${API}/${sheetId}?fields=sheets.properties.title&key=${key}`,
    "discovering tabs",
  );
  const titles = (meta.sheets ?? [])
    .map((s) => s.properties?.title)
    .filter((t) => typeof t === "string" && t.length > 0);
  if (titles.length === 0) {
    throw new Error("[sheets] no tabs found in spreadsheet");
  }

  // 2) batch-read every tab; dates as 1900-epoch serial numbers.
  const ranges = titles
    .map((t) => `ranges=${encodeURIComponent(t)}`)
    .join("&");
  const data = await getJson(
    `${API}/${sheetId}/values:batchGet?${ranges}` +
      `&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER&key=${key}`,
    "reading tab values",
  );

  // valueRanges come back in the requested order → align with titles by index.
  const valueRanges = data.valueRanges ?? [];
  return titles.map((sheetName, i) => ({
    sheetName,
    rows: matrixToRows(valueRanges[i]?.values),
  }));
}
