import { NextResponse } from "next/server";

// POST /api/refresh — trigger the Vercel Deploy Hook so main rebuilds with the
// latest Google Sheet data (ADR 0002 / PLAN §2). DEPLOY_HOOK_URL is a
// server-only secret: the client calls this route, which POSTs to the hook
// server-side, so the hook URL is never exposed to the browser.

export async function POST() {
  const hook = process.env.DEPLOY_HOOK_URL;
  if (!hook) {
    return NextResponse.json(
      { ok: false, error: "DEPLOY_HOOK_URL이 서버에 설정되지 않았습니다." },
      { status: 500 },
    );
  }

  try {
    const res = await fetch(hook, { method: "POST" });
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `배포 훅 응답 오류 (HTTP ${res.status}).` },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "알 수 없는 오류";
    return NextResponse.json(
      { ok: false, error: `배포 훅 호출 실패: ${message}` },
      { status: 502 },
    );
  }
}
