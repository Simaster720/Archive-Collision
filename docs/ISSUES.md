# 알려진 이슈 / 추후 처리 목록

확정되지 않았거나 나중에 손볼 항목을 추적한다. (코드 버그가 아니라 데이터·운영 결정 사항 위주)

---

## 1. 이미지 1장 해상도 축소됨 — `S1_SS11_01.JPG` (수업 › SS11)

- **상태**: 보류 (사용자가 추후 직접 수정 예정)
- **내용**: 원본 `5712×4284 (24.5MP), 10.57MB`가 Cloudinary 무료 플랜의 이미지당 10MB 한도를 초과해 업로드 거부됨. 화질 유지를 위해 `5000×3750, JPEG 품질 85, 9.46MB`로 축소해 업로드함. 나머지 199장은 원본 그대로.
- **원본 위치**: 로컬 `drive-download-*/S1_SS11_01.JPG` (gitignore, 보존됨)
- **복원 방법**: Cloudinary 유료 플랜 업그레이드 후 원본을 `public_id=archive-collision/S1/SS11/S1_SS11_01`로 재업로드(`overwrite:true`).
- **주의**: `npm run upload` 재실행 시 이 1장은 원본(10.57MB)으로 다시 시도하므로 또 실패함(나머지는 정상). 자동 축소 로직은 의도적으로 넣지 않음 — 추후 처리 방침에 따름.

---

## 2. 엑셀 ↔ 실제 이미지 불일치 (현재 사이트 198개 표시)

- **상태**: ✅ **완료 (closed, 2026-06-15)** — #3(Google Sheets 전환)과 함께 정리. 시트 `수업` 탭에서 유령 SS13 `.png` 2행 삭제 + SS14 2행 추가 → 200개 완성. 상세: [PLAN](./PLAN-gsheets-data-source.md) D6 / [ADR 0002](./adr/0002-gsheets-buildtime-data-source.md).
- **내용(당시)**:
  - **엑셀에만 있음(이미지 없음)**: `S1_SS13_01.png`, `S1_SS13_02.png` — 생산일자 2026-06-14의 중복/유령 행. 디스크엔 같은 번호 `.JPG`만 존재. 빌드 시 첫 행 우선 dedupe로 제외됨(경고 로그).
  - **이미지에만 있음(엑셀 없음)**: `S1_SS14_01.png`, `S1_SS14_02.png` — 수업 14번째 서브시리즈(SS14). 엑셀에 행이 없어 사이트 미표시. (이미지는 Cloudinary에 업로드돼 있음 → 행 추가만 하면 즉시 표시)
- **완료 내역**: Google Sheet `수업` 탭에서 유령 `.png` 2행 삭제 + `S1_SS14_01.png`/`S1_SS14_02.png` 추가. `npm run data` → `totals.files=200`(수업 112 / 원우회 37 / 교내활동 51, 서브시리즈 20). Cloudinary 200장(SS13=jpeg·SS14=png)과 일치 확인. 이후 데이터 단일 소스 = 시트.

---

## 3. 데이터 소스 전환 검토 — 빌드타임 엑셀 → Google Sheets 조회

- **상태**: ✅ **구현 완료 (2026-06-15)** — Phase 1(파이프라인 전환: [scripts/lib/sheets.mjs](../scripts/lib/sheets.mjs) + [build-data.mjs](../scripts/build-data.mjs) 입력부) + D11 메타 스키마(`전자여부`→`분량`) + Phase 2(새로고침 버튼: [app/api/refresh/route.ts](../app/api/refresh/route.ts)·[app/refresh/page.tsx](../app/refresh/page.tsx)) 구현·로컬 검증 완료. 배포는 **Vercel env(Production·Preview)에 키 설정 후** develop push.
- **내용**: 최종본 확정 전까지 엑셀이 계속 수정되므로, Google Sheets를 단일 소스로 두고 웹이 빌드타임에 조회해 표기. SSG 유지 + Sheets API(API 키) + 새로고침 버튼(Deploy Hook). 기준 데이터는 `신수찬 콜렉션_0614_수정.xlsx`(시트 이관본).
- **상세 문서**: [이슈](./ISSUE-gsheets-data-source.md) · [계획](./PLAN-gsheets-data-source.md) · [핸드오프](./HANDOFF-gsheets.md) · [ADR 0002](./adr/0002-gsheets-buildtime-data-source.md)

---

## 4. 전폭(full-width) 트래킹 박스를 이미지당 최대 1개로 제한 (확정본 대비 변경)

- **상태**: 적용됨 (2026-06-15, 클라이언트 확인) · **되돌릴 수 있음** — 추후 요청 시 확정본 동작으로 복귀 가능
- **관련**: [PLAN-ai-verdict-0615 §6 DoD](./PLAN-ai-verdict-0615.md) · [CONTEXT.md 트래킹 박스](../CONTEXT.md) · [scripts/lib/ai-verdict.mjs](../scripts/lib/ai-verdict.mjs)
- **전폭 박스란**: width가 이미지 폭의 ~90% 이상이라 이미지를 가로지르는 **띠(band)** 모양 박스(예: 위·아래 가장자리 비네팅/색수차 띠). eval 데이터의 평가항목 다수가 "전체화면 영역"이라 이렇게 나온다. 작은(지점) 박스와 달리 여러 개 쌓이면 "줄무늬"처럼 보여 탐지 포인트가 흐려진다.
- **내용**: main 확정본 `selectBoxes`의 **"부족 시 완화 충전" 루프**가 `maxEdgeWideBoxes: 1` 캡을 건너뛰어, 198장 중 **5장**(`S1_SS2_02`·`S1_SS5_05`·`S1_SS11_06`(3개)·`S2_SS1_07`·`S3_SS2_08`)에서 전폭 박스가 2~3개 노출됐다. 이 5장은 작가 확정 데모 5장에 포함되지 않아 검토되지 않음.
- **결정**: DoD "전폭 박스 ≤1"을 충족하도록 **완화 충전 루프에서 전폭(가로 띠, wr≥0.9) 박스를 최대 1개로 캡**. 가로 띠만 대상으로 하므로 세로 띠·큰 박스는 영향 없음 → **작가 확정 데모 5장(S3_SS2_05 등)은 데모와 동일하게 유지**(검증: S3_SS2_05의 세로 띠 PORE TEX 보존). 빈 슬롯은 일반 박스로 채우거나(없으면) 박스 수가 줄어든다.
- **되돌리는 법**: [scripts/lib/ai-verdict.mjs](../scripts/lib/ai-verdict.mjs)의 `selectBoxes` 완화 충전 루프에서 `let fullWide = ...` 초기화 줄, `if (f._m.wr >= 0.9 && fullWide >= C.maxEdgeWideBoxes) continue;`, `if (f._m.wr >= 0.9) fullWide += 1;` 세 줄을 제거 → `node scripts/build-data.mjs` 재생성. 확정본(데모)과 1:1 동일 동작 복귀.
