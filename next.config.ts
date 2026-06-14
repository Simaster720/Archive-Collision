import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Cloudinary delivers all file images (PLAN §4). CldImage uses its own
    // loader, but whitelisting the host also allows plain next/image if needed.
    remotePatterns: [{ protocol: "https", hostname: "res.cloudinary.com" }],
  },
};

export default nextConfig;
