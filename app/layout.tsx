import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "신수찬 컬렉션",
  description: "신수찬 컬렉션 아카이브",
};

// Pretendard dynamic-subset (Korean-optimized) via CDN. Plan §2: Pretendard.
const PRETENDARD_CSS =
  "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@latest/dist/web/variable/pretendardvariable-dynamic-subset.min.css";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link rel="stylesheet" href={PRETENDARD_CSS} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
