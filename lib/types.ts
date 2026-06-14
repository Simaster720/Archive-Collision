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
  ai: null; // ★ reserved — AI verdict wired later (PLAN §7)
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
