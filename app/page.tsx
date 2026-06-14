import CollectionCover from "@/components/CollectionCover";
import { getCollectionData } from "@/lib/collection";

// Landing = minimal collection cover. Persistent sidebar lives in the layout.
export default function Home() {
  const { collection } = getCollectionData();
  return <CollectionCover name={collection.name} />;
}
