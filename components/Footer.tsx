// Footer (PLAN §6 / D10): collection name + production credits.
const CREDITS = [
  "AI 판독 알고리즘 제작 : 박진혁",
  "웹 개발 및 배포 : 신동민",
];

export default function Footer({ name }: { name: string }) {
  return (
    <footer className="mt-auto border-t border-border px-6 py-6 text-xs text-muted md:px-10">
      <p>{name}</p>
      <div className="mt-3 leading-relaxed text-muted/80">
        <p>Thanks to</p>
        {CREDITS.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </footer>
  );
}
