import type { Metadata } from "next";
import "./globals.css";
import SidebarTree from "@/components/SidebarTree";
import Footer from "@/components/Footer";
import { getNavTree } from "@/lib/collection";

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
  const tree = getNavTree();

  return (
    <html lang="ko" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link rel="stylesheet" href={PRETENDARD_CSS} />
      </head>
      <body className="min-h-full">
        {/* Persistent sidebar + main slot. Stacks on mobile, side-by-side on desktop. */}
        <div className="flex min-h-screen flex-col md:flex-row">
          <aside className="w-full border-b border-border bg-background md:sticky md:top-0 md:h-screen md:w-72 md:shrink-0 md:overflow-y-auto md:border-b-0 md:border-r">
            <SidebarTree tree={tree} />
          </aside>
          <main className="flex min-w-0 flex-1 flex-col">
            <div className="flex-1">{children}</div>
            <Footer name={tree.collection.name} />
          </main>
        </div>
      </body>
    </html>
  );
}
