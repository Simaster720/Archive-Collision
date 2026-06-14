"use client";

import { useState } from "react";

// 새로고침 페이지: Google Sheet 수정 후 이 버튼으로 Vercel Deploy Hook을 호출해
// main을 재배포한다(1~2분 반영). 훅 URL은 /api/refresh 서버 라우트에만 있고
// 클라이언트엔 노출되지 않는다(ADR 0002).

type Status = "idle" | "loading" | "success" | "error";

export default function RefreshPage() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleRefresh() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/refresh", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `요청 실패 (HTTP ${res.status})`);
      }
      setStatus("success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류");
      setStatus("error");
    }
  }

  return (
    <article className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-2xl font-bold tracking-tight">사이트 새로고침</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Google Sheet를 수정한 뒤 아래 버튼을 누르면 사이트가 최신 데이터로 다시
        배포됩니다. 반영까지 약 1~2분 걸립니다.
      </p>

      <button
        type="button"
        onClick={handleRefresh}
        disabled={status === "loading"}
        className="mt-8 rounded-full border border-border px-5 py-2.5 text-sm font-medium transition hover:bg-foreground hover:text-background disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === "loading" ? "요청 중…" : "사이트 새로고침"}
      </button>

      <div className="mt-6 min-h-6 text-sm" role="status" aria-live="polite">
        {status === "success" && (
          <p className="text-foreground">
            ✓ 새로고침을 요청했습니다. 약 1~2분 후 변경 사항이 반영됩니다.
          </p>
        )}
        {status === "error" && <p className="text-red-600">✗ {error}</p>}
      </div>
    </article>
  );
}
