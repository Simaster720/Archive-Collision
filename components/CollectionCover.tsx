// Minimal title-centric cover (PLAN §5.2 / 결정 #8). No intro copy — the brief
// has none, so none is invented (기획서: 없는 콘텐츠 금지).

export default function CollectionCover({ name }: { name: string }) {
  return (
    <section className="flex min-h-[60vh] flex-col items-center justify-center p-10 text-center md:min-h-screen">
      <p className="text-xs font-medium tracking-[0.35em] text-muted">[C]</p>
      <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-5xl">{name}</h1>
    </section>
  );
}
