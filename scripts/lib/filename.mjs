// Registration number ↔ hierarchy parsing.
// The filename IS the registration number and encodes the hierarchy:
//   S{series}_SS{subseries}_{seq}.{ext}   e.g. "S1_SS1_01.png"
// Shared by build-data.mjs (JSON pipeline) and upload-cloudinary.mjs
// so both derive identical ids / Cloudinary public_ids.

export const CLOUDINARY_ROOT = "archive-collision";

const CODE_RE = /^S(\d+)_SS(\d+)_(\d+)$/;

/**
 * Parse a registration filename into its hierarchy parts.
 * @param {string} fileName e.g. "S1_SS13_12.PNG"
 * @returns {{
 *   id: string, ext: string,
 *   seriesCode: string, subseriesCode: string, seq: number,
 *   publicId: string
 * }}
 * @throws if the name does not match the registration pattern.
 */
export function parseRegistration(fileName) {
  if (typeof fileName !== "string" || fileName.length === 0) {
    throw new Error(`Invalid filename: ${JSON.stringify(fileName)}`);
  }
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0) {
    throw new Error(`Filename has no extension: ${fileName}`);
  }
  const id = fileName.slice(0, dot);
  const ext = fileName.slice(dot + 1).toLowerCase();

  const m = CODE_RE.exec(id);
  if (!m) {
    throw new Error(`Filename does not match S{n}_SS{n}_{seq}: ${fileName}`);
  }
  const seriesCode = `S${Number(m[1])}`;
  const subseriesCode = `SS${Number(m[2])}`;
  const seq = Number(m[3]);
  const publicId = `${CLOUDINARY_ROOT}/${seriesCode}/${subseriesCode}/${id}`;

  return { id, ext, seriesCode, subseriesCode, seq, publicId };
}
