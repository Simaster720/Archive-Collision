// Shape of data/collection.json (produced by scripts/build-data.mjs, PLAN §3.3).

export interface CollectionRef {
  code: string; // "C"
  name: string; // "신수찬 컬렉션"
}

export interface SeriesRef {
  code: string; // "S1"
  name: string; // "수업"
}

export interface SubseriesRef {
  code: string; // "SS1"
  name: string; // resolved name or code fallback
}

export interface FileMeta {
  형태: string | null;
  생산자: string | null;
  분량: string | null;
}

export interface FileImage {
  publicId: string; // archive-collision/S{n}/SS{n}/{id}
  ext: string;
}

// AI verdict (CONTEXT.md / PLAN §3). Curated at build time from
// data/source/eval_results.xlsx; coordinates are ORIGINAL pixels (pre-jitter —
// the jitter is a client-only display effect, ADR 0003).
export interface VerdictBox {
  label: string; // short English label (e.g. "VIGNETTE")
  titleKo: string; // original Korean feature name
  scorePct: number; // suspicion % (0~100)
  color: string; // threshold-based color (#FF1F1F / #FF9500 / #00E85F)
  description: string; // evidence sentence
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface AiVerdict {
  imageWidth: number;
  imageHeight: number;
  finalScore: number; // 0~100
  judgement: "ai" | "real"; // finalScore >= 50 ? "ai" : "real" (D8)
  boxes: VerdictBox[]; // curated ~6 (selected / sorted / penalized)
}

export interface FileItem {
  id: string;
  fileName: string;
  series: SeriesRef;
  subseries: SubseriesRef;
  title: string | null;
  date: string | null;
  content: string | null;
  meta: FileMeta;
  image: FileImage;
  ai: AiVerdict | null; // null when eval data missing (build never breaks)
}

export interface Subseries {
  code: string;
  name: string;
  fileCount: number;
  files: FileItem[];
}

export interface Series {
  code: string;
  name: string;
  fileCount: number;
  subseriesCount: number;
  subseries: Subseries[];
}

export interface CollectionData {
  collection: CollectionRef;
  totals: { files: number; series: number; subseries: number };
  series: Series[];
}

// Slim nav tree (no file payloads) — passed to the client SidebarTree.
export interface NavSubseries {
  code: string;
  name: string;
  fileCount: number;
}

export interface NavSeries {
  code: string;
  name: string;
  fileCount: number;
  subseries: NavSubseries[];
}

export interface NavTree {
  collection: CollectionRef;
  series: NavSeries[];
}
