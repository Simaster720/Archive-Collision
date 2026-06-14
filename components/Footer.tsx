// Minimal footer (PLAN §6). Factual only — no invented credits.
export default function Footer({ name }: { name: string }) {
  return (
    <footer className="mt-auto border-t border-border px-6 py-6 text-xs text-muted md:px-10">
      {name}
    </footer>
  );
}
