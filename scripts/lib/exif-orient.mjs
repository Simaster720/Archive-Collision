// EXIF-orientation geometry correction (HANDOFF docs/HANDOFF-exif-orientation-crop.md).
//
// The eval pipeline (data/source/batch_eval.py) read raw buffer dimensions
// WITHOUT applying the camera's EXIF Orientation, so eval_results.xlsx records
// image dims + box coords in the *raw* (pre-rotation) space. Cloudinary serves
// the EXIF-APPLIED image, so the two coordinate systems disagree → the detail
// page shows a vertical crop + boxes land on the wrong features.
//
// Decision C (§4): leave the xlsx untouched and rotate the GEOMETRY ONLY at
// build time, into display space. Lossless, no re-scoring, no text change. The
// frontend (components/AiVerdict.tsx) is NOT touched — once collection.json
// carries display-space dims/coords the existing render is correct.
//
// All exports are pure + immutable: inputs are never mutated (global coding
// style). `applyOrientation` runs in scripts/lib/eval.mjs BEFORE selectBoxes so
// the curation runs on display-space geometry (§5.3).

// Standard 8-case point transform (§5.1). Maps a stored point (x,y) in a raw
// W×H image to its location after the viewer applies EXIF orientation `o`.
function transformPoint(x, y, W, H, o) {
  switch (o) {
    case 2: return [W - x, y];
    case 3: return [W - x, H - y];
    case 4: return [x, H - y];
    case 5: return [y, x];
    case 6: return [H - y, x];
    case 7: return [H - y, W - x];
    case 8: return [y, W - x];
    case 1:
    default: return [x, y];
  }
}

/** Orientations 5–8 are 90°/270°/transpose/transverse → width/height swap. */
export function swapsDims(o) {
  return o === 5 || o === 6 || o === 7 || o === 8;
}

/**
 * Transform a box {x1,y1,x2,y2} from raw to display space (§5.1). Both corners
 * are mapped, then re-normalized to x1<x2 / y1<y2 so a sign flip (e.g. o=6 maps
 * a top-left corner past the new origin) still yields a valid box. Other fields
 * (score, title, …) are preserved. Integer px in → integer px out.
 * @returns a NEW box object (no mutation).
 */
export function transformBox(box, W, H, o) {
  const [ax, ay] = transformPoint(box.x1, box.y1, W, H, o);
  const [bx, by] = transformPoint(box.x2, box.y2, W, H, o);
  return {
    ...box,
    x1: Math.min(ax, bx),
    y1: Math.min(ay, by),
    x2: Math.max(ax, bx),
    y2: Math.max(ay, by),
  };
}

/**
 * Apply EXIF orientation `o` to a whole 특징JSON object (immutable): swap the
 * image dims when the rotation is 90°-ish and transform every feature box.
 * Orientation 1 (or unknown/missing dims) is a no-op — the original object is
 * returned unchanged, which is safe because nothing here mutates.
 * @param {{image?: {width?: number, height?: number}, features?: any[]}} featureJson
 * @param {number} o EXIF orientation 1..8
 */
export function applyOrientation(featureJson, o) {
  if (o == null || o === 1) return featureJson;
  const img = featureJson?.image;
  if (!img || img.width == null || img.height == null) return featureJson;

  const W = img.width;
  const H = img.height;
  const swap = swapsDims(o);
  const features = Array.isArray(featureJson.features) ? featureJson.features : [];

  return {
    ...featureJson,
    image: { ...img, width: swap ? H : W, height: swap ? W : H },
    features: features.map((f) => transformBox(f, W, H, o)),
  };
}
