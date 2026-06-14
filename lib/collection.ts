import rawData from "@/data/collection.json";
import type {
  CollectionData,
  FileItem,
  NavTree,
  Series,
  Subseries,
} from "./types";

// data/collection.json is generated at build time (prebuild). Typed access +
// lookups + static-param helpers for the SSG routes live here.
const data = rawData as CollectionData;

export function getCollectionData(): CollectionData {
  return data;
}

/** Slim tree (codes / names / counts, no file arrays) for the client sidebar. */
export function getNavTree(): NavTree {
  return {
    collection: data.collection,
    series: data.series.map((s) => ({
      code: s.code,
      name: s.name,
      fileCount: s.fileCount,
      subseries: s.subseries.map((sub) => ({
        code: sub.code,
        name: sub.name,
        fileCount: sub.fileCount,
      })),
    })),
  };
}

export function findSeries(seriesCode: string): Series | undefined {
  return data.series.find((s) => s.code === seriesCode);
}

export function findSubseries(
  seriesCode: string,
  subseriesCode: string,
): { series: Series; subseries: Subseries } | undefined {
  const series = findSeries(seriesCode);
  const subseries = series?.subseries.find((sub) => sub.code === subseriesCode);
  if (!series || !subseries) return undefined;
  return { series, subseries };
}

export function findFile(
  seriesCode: string,
  subseriesCode: string,
  fileId: string,
): { series: Series; subseries: Subseries; file: FileItem } | undefined {
  const found = findSubseries(seriesCode, subseriesCode);
  const file = found?.subseries.files.find((f) => f.id === fileId);
  if (!found || !file) return undefined;
  return { ...found, file };
}

/** All /[series]/[subseries] params for generateStaticParams. */
export function allSubseriesParams(): { series: string; subseries: string }[] {
  return data.series.flatMap((s) =>
    s.subseries.map((sub) => ({ series: s.code, subseries: sub.code })),
  );
}

/** All /[series]/[subseries]/[file] params for generateStaticParams. */
export function allFileParams(): {
  series: string;
  subseries: string;
  file: string;
}[] {
  return data.series.flatMap((s) =>
    s.subseries.flatMap((sub) =>
      sub.files.map((f) => ({
        series: s.code,
        subseries: sub.code,
        file: f.id,
      })),
    ),
  );
}
