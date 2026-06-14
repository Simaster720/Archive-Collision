import Link from "next/link";
import { thumbnailUrl } from "@/lib/cloudinary";
import type { FileItem } from "@/lib/types";

// Square thumbnail grid (PLAN §5.2 / 기획서 p.3): files show the original IMAGE,
// not a name; up to 3 across, wrapping down. Cropping is fine (c_fill 1:1).
//
// Uses a plain <img> with Cloudinary-generated URLs (PLAN §2 allowed this as the
// CldImage alternative). next-cloudinary's <CldImage> component is incompatible
// with Next 16 / React 19 at runtime (useState error during prerender), but its
// URL builder is server-safe — so we keep the same delivery transforms here and
// the grid stays a server component (no client JS).

export default function FileGrid({
  files,
  basePath,
}: {
  files: FileItem[];
  basePath: string;
}) {
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
      {files.map((f) => {
        const src = thumbnailUrl(f.image.publicId, 300);
        const src2x = thumbnailUrl(f.image.publicId, 600);
        return (
          <li key={f.id}>
            <Link
              href={`${basePath}/${f.id}`}
              aria-label={f.title ?? f.id}
              className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-link"
            >
              <div className="relative aspect-square overflow-hidden bg-neutral-100">
                {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary
                    delivers optimized square thumbs (c_fill,f_auto,q_auto). */}
                <img
                  src={src}
                  srcSet={`${src} 1x, ${src2x} 2x`}
                  alt={f.title ?? f.id}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                />
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
