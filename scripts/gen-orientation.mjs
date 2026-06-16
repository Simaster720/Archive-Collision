// One-off generator: drive-download-* image EXIF Orientation → data/source/orientation.json
//
//   node scripts/gen-orientation.mjs [imageDir]
//
// WHY a committed JSON and not a runtime read (HANDOFF §5.4): the drive-download
// originals are NOT present in CI/Vercel. So we read EXIF here, once, against the
// SAME bytes uploaded to Cloudinary (the EXIF truth source — Cloudinary applies
// the original's orientation when serving), and commit the result. The build
// (scripts/lib/eval.mjs) then reads only this JSON — zero runtime dependency.
//
// The EXIF parser is implemented inline (JPEG APP1 / TIFF IFD0 tag 0x0112) so no
// dependency is added even for this dev-time script. Non-JPEG (png/webp/heic/…)
// have no EXIF orientation here → recorded as 1 (no transform). Re-run only when
// geometry changes (new images / image swap); re-scoring does NOT require it.

import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_FILE = join(ROOT, "data", "source", "orientation.json");
const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "heic", "webp", "gif", "tif", "tiff"]);

// ── EXIF reader ────────────────────────────────────────────────────────────
// TIFF IFD0 tag 0x0112 (Orientation, SHORT). `tiffStart` points at the TIFF
// header ("II"/"MM"). Returns 1..8, or null if the tag is absent/unreadable.
function parseExifOrientation(buf, tiffStart) {
  if (tiffStart + 8 > buf.length) return null;
  const le = buf.toString("ascii", tiffStart, tiffStart + 2) === "II";
  const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  if (u16(tiffStart + 2) !== 0x002a) return null; // TIFF magic
  const ifd0 = tiffStart + u32(tiffStart + 4);
  if (ifd0 + 2 > buf.length) return null;
  const count = u16(ifd0);
  for (let i = 0; i < count; i++) {
    const entry = ifd0 + 2 + i * 12;
    if (entry + 12 > buf.length) break;
    if (u16(entry) === 0x0112) {
      const value = u16(entry + 8); // SHORT lives in the first 2 bytes of the value field
      return value >= 1 && value <= 8 ? value : null;
    }
  }
  return null;
}

// Walk JPEG segment markers to the Exif APP1 segment. Returns 1..8 or null.
function readJpegOrientation(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null; // not JPEG
  let offset = 2;
  while (offset + 4 <= buf.length) {
    if (buf[offset] !== 0xff) { offset += 1; continue; } // resync to next marker
    const marker = buf[offset + 1];
    if (marker === 0xd9 || marker === 0xda) break; // EOI / SOS → no metadata past here
    const size = buf.readUInt16BE(offset + 2); // segment length (incl. these 2 bytes)
    if (marker === 0xe1 && buf.toString("ascii", offset + 4, offset + 8) === "Exif") {
      return parseExifOrientation(buf, offset + 10); // skip "Exif\0\0" → TIFF header
    }
    offset += 2 + size;
  }
  return null;
}

// ── helpers ────────────────────────────────────────────────────────────────
function idFromFileName(fileName) {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

function resolveImageDir(argDir) {
  if (argDir) return argDir;
  const auto = readdirSync(ROOT).find(
    (n) => n.startsWith("drive-download-") && statSync(join(ROOT, n)).isDirectory(),
  );
  if (!auto) {
    throw new Error(
      "No image dir given and no drive-download-* folder found. Pass the folder path as an argument.",
    );
  }
  return join(ROOT, auto);
}

function listImages(dir) {
  return readdirSync(dir)
    .filter((n) => !n.startsWith("."))
    .filter((n) => {
      const dot = n.lastIndexOf(".");
      return dot > 0 && IMAGE_EXT.has(n.slice(dot + 1).toLowerCase());
    })
    .sort();
}

function main() {
  const dir = resolveImageDir(process.argv[2]);
  const images = listImages(dir);

  const map = {};
  const dist = {}; // orientation → count, for the summary line
  let collisions = 0;
  for (const fileName of images) {
    const id = idFromFileName(fileName);
    let o = 1;
    try {
      o = readJpegOrientation(readFileSync(join(dir, fileName))) ?? 1;
    } catch (err) {
      console.warn(`[gen-orientation] ⚠ ${fileName}: ${err.message} — defaulting to 1`);
    }
    if (id in map && map[id] !== o) {
      console.warn(`[gen-orientation] ⚠ id collision ${id}: ${map[id]} vs ${o} — keeping first`);
      collisions += 1;
      continue;
    }
    map[id] = o;
    dist[o] = (dist[o] ?? 0) + 1;
  }

  // Stable key order (sorted) → deterministic, review-friendly diffs.
  const sorted = Object.fromEntries(Object.keys(map).sort().map((k) => [k, map[k]]));
  writeFileSync(OUT_FILE, JSON.stringify(sorted, null, 2) + "\n", "utf8");

  const distStr = Object.keys(dist)
    .sort()
    .map((o) => `${o}×${dist[o]}`)
    .join(" ");
  console.log(
    `[gen-orientation] wrote ${OUT_FILE}: ${Object.keys(sorted).length} id(s) from ${dir}`,
  );
  console.log(`[gen-orientation] orientation distribution: ${distStr}${collisions ? ` (${collisions} collision[s] skipped)` : ""}`);
}

main();
