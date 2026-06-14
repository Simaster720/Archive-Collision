// Image pipeline: local image folder → Cloudinary (PLAN §4).
//
// Each filename is the registration code, so the Cloudinary public_id is
// derived deterministically (same rule as build-data via lib/filename.mjs):
//   archive-collision/S{n}/SS{n}/{id}
// Delivery transforms (c_fill / f_auto / q_auto …) are applied at request time
// by the app, so we upload the ORIGINAL bytes once. Idempotent: overwrite=true.
//
// Usage (env from .env.local):
//   node --env-file=.env.local scripts/upload-cloudinary.mjs [imageDir]
//   node --env-file=.env.local scripts/upload-cloudinary.mjs --dry-run
//   node --env-file=.env.local scripts/upload-cloudinary.mjs --limit=2

import { v2 as cloudinary } from "cloudinary";
import { readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseRegistration } from "./lib/filename.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "heic", "webp", "gif", "tif", "tiff"]);
const CONCURRENCY = 8;

function parseArgs(argv) {
  const opts = { dir: null, dryRun: false, limit: Infinity };
  for (const a of argv.slice(2)) {
    if (a === "--dry-run") opts.dryRun = true;
    else if (a.startsWith("--limit=")) opts.limit = Number(a.slice("--limit=".length));
    else if (!a.startsWith("--")) opts.dir = a;
  }
  return opts;
}

function configFromEnv() {
  const cloud_name = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const api_key = process.env.CLOUDINARY_API_KEY;
  const api_secret = process.env.CLOUDINARY_API_SECRET;
  const missing = Object.entries({
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: cloud_name,
    CLOUDINARY_API_KEY: api_key,
    CLOUDINARY_API_SECRET: api_secret,
  })
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    throw new Error(
      `Missing env: ${missing.join(", ")}. Run with: node --env-file=.env.local scripts/upload-cloudinary.mjs`,
    );
  }
  cloudinary.config({ cloud_name, api_key, api_secret });
}

function resolveImageDir(argDir) {
  if (argDir) return argDir;
  const auto = readdirSync(ROOT).find(
    (n) => n.startsWith("drive-download-") && statSync(join(ROOT, n)).isDirectory(),
  );
  if (!auto) {
    throw new Error("No image dir given and no drive-download-* folder found. Pass the folder path as an argument.");
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

async function uploadOne(dir, fileName) {
  const { publicId } = parseRegistration(fileName);
  const res = await cloudinary.uploader.upload(join(dir, fileName), {
    public_id: publicId,
    overwrite: true,
    unique_filename: false,
    use_filename: false,
    resource_type: "image",
  });
  return { fileName, publicId, bytes: res.bytes, format: res.format };
}

/** Bounded-concurrency pool; never rejects — collects per-item outcomes. */
async function runPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let cursor = 0;
  let done = 0;
  async function loop() {
    while (cursor < items.length) {
      const idx = cursor++;
      try {
        results[idx] = { ok: true, ...(await worker(items[idx])) };
      } catch (e) {
        results[idx] = {
          ok: false,
          item: items[idx],
          error: e?.error?.message || e?.message || String(e),
        };
      }
      done++;
      process.stdout.write(`\r  progress ${done}/${items.length}`);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, loop),
  );
  process.stdout.write("\n");
  return results;
}

async function main() {
  const opts = parseArgs(process.argv);
  const dir = resolveImageDir(opts.dir);
  let images = listImages(dir);

  // Fail-fast validate names; skip (with warning) anything that doesn't parse.
  const bad = images.filter((n) => {
    try {
      parseRegistration(n);
      return false;
    } catch {
      return true;
    }
  });
  if (bad.length) console.warn(`[upload] ⚠ skipping ${bad.length} unparseable: ${bad.join(", ")}`);
  images = images.filter((n) => !bad.includes(n));

  if (Number.isFinite(opts.limit)) images = images.slice(0, opts.limit);

  console.log(`[upload] ${images.length} image(s) from ${dir}${opts.dryRun ? " (dry-run)" : ""}`);

  if (opts.dryRun) {
    for (const n of images.slice(0, 5)) {
      console.log(`   ${n}  →  ${parseRegistration(n).publicId}`);
    }
    if (images.length > 5) console.log(`   … (+${images.length - 5} more)`);
    return;
  }

  configFromEnv();
  const results = await runPool(images, (n) => uploadOne(dir, n), CONCURRENCY);
  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  console.log(`[upload] done: ${ok.length} ok, ${failed.length} failed`);
  for (const f of failed) console.error(`   FAIL ${f.item}: ${f.error}`);
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error("[upload] fatal:", e?.message || e);
  process.exitCode = 1;
});
