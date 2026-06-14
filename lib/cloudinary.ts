import { getCldImageUrl } from "next-cloudinary";

// Delivery layer for Cloudinary-hosted file images (PLAN §4.3).
// public_id rule: archive-collision/S{n}/SS{n}/{id} (set at upload time).
// Components may use <CldImage> directly; these helpers centralize the same
// transform presets for non-component use (srcset fallbacks, OG images, etc.).

export const CLOUDINARY_CLOUD_NAME =
  process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "";

/** Square crop-fill thumbnail for the grid (auto gravity, f_auto/q_auto). */
export function thumbnailUrl(publicId: string, size = 600): string {
  return getCldImageUrl({
    src: publicId,
    width: size,
    height: size,
    crop: "fill",
    gravity: "auto",
  });
}

/** Detail view: full image limited to a max width (f_auto/q_auto). */
export function detailUrl(publicId: string, maxWidth = 1600): string {
  return getCldImageUrl({
    src: publicId,
    width: maxWidth,
    crop: "limit",
  });
}
