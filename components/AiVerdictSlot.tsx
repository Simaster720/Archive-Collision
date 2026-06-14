// ★ Reserved slot for the AI verdict (PLAN §7 / 기획서 p.4-7).
// The full feature — tracking boxes overlaid on the image, colored evidence
// labels, a "~% 생성 의심" summary — is intentionally DEFERRED until the AI
// verdict data (.xlsx) is provided. Only the schema field `file.ai` and this
// placeholder exist now. Do NOT fabricate a verdict here (기획서: 없는 콘텐츠 금지).

export default function AiVerdictSlot() {
  return (
    <section
      aria-label="AI 판별"
      className="mt-10 rounded-lg border border-dashed border-border bg-neutral-50 px-6 py-12 text-center"
    >
      <p className="text-sm font-medium text-muted">AI 판별</p>
      <p className="mt-1 text-xs text-muted/80">데이터 준비 중입니다.</p>
    </section>
  );
}
