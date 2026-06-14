# 핸드오프 — 데이터 소스 전환 (Google Sheets)

다른 세션에서 이 작업을 이어받기 위한 지시문. 먼저 아래 문서를 순서대로 읽고 시작할 것.

1. [docs/PLAN-gsheets-data-source.md](./PLAN-gsheets-data-source.md) — 작업 계획(결정 로그·단계·코드 seam)
2. [docs/ISSUE-gsheets-data-source.md](./ISSUE-gsheets-data-source.md) — 배경·현재 구조·열린 질문(이제 모두 해소됨)
3. [docs/adr/0002](./adr/0002-gsheets-buildtime-data-source.md) — 결정 근거 / [docs/adr/0001](./adr/0001-vercel-hobby-pat-merge-deploy.md) — 배포 게이트(맥락)
4. [CONTEXT.md](../CONTEXT.md) — 도메인 글로서리(이번 작업으로 **변경 없음**)

---

## 0. 한 줄 요약

`build-data.mjs`의 **입력 한 지점만** 엑셀 파일 읽기 → Google Sheets API 읽기로 바꾼다. SSG·파생 규칙·라우팅은 그대로. 작가는 시트 수정 후 "새로고침" 버튼으로 1~2분 내 반영. 모든 설계 결정은 grilling 완료(PLAN §1) — **번복 금지**.

---

## 1. 확정된 결정 (재논의 불필요 — PLAN §1 요약)

- **D1 SSG 유지 + 빌드타임 fetch.** ISR·런타임·클라 fetch 아님.
- **D2 Sheets API v4 + API 키.** 시트 "링크 보기" 공유. 서비스 계정·게시 CSV·gviz 아님.
- **D3 새로고침 버튼 = Vercel Deploy Hook(main 대상).**
- **D4 fetch 실패 시: CI/Vercel=빌드 실패(폴백 없음), 로컬=커밋된 `collection.json` 폴백.**
- **D5 `collection.json` 커밋 유지**(시드·폴백·오프라인·정적 import 대상).
- **D6 #2 데이터 정합성을 시트에서 200개로 정리**(유령 SS13 2행 삭제 + SS14 2행 추가).
- **D7 이미지=Cloudinary 진실원천**(시트엔 등록번호만). **D8 AI 판별=범위 외.**
- **D9 탭 3개=시리즈 3개(시리즈명 그대로), 헤더=`_수정.xlsx` 그대로.**
- **D10 `서브시리즈명` 옵션 열 유지**(비면 코드 폴백).
- **D11 메타 스키마=수정본 따름**: `분량` 채택, `전자여부` 제거. 정보창 메타=형태·생산자·분량. (수정본이 전자여부 삭제·분량 추가·형태/생산자/제목 전부 채움)

---

## 2. 핵심 기술 사실 (재조사 불필요 — 이미 분석함)

**현재 데이터 흐름** (변경 대상은 ★ 한 곳뿐)
```
data/source/*.xlsx ─★readFileSync/XLSX.read─► rows ─► rowToFile ─► dedupeById ─► buildTree ─► data/collection.json
                                                                                                  └─ lib/collection.ts(정적 import) ─► 전 라우트 SSG
```

- **소비 계층은 100% 정적**: [lib/collection.ts:1](../lib/collection.ts#L1) `import rawData from "@/data/collection.json"`. 양 라우트 `generateStaticParams` + `dynamicParams=false`. 런타임 fetch 없음.
- **파서는 헤더명 기반**([build-data.mjs:27](../scripts/build-data.mjs#L27) `COL`). ⚠️ **`_수정.xlsx`는 원본과 헤더가 다름**: `전자여부` 삭제·`분량`(198/200) 추가·`형태`/`생산자`/`제목` 전부 채움. → `COL`/`FileMeta`/`FileDetail.tsx`를 `전자여부`→`분량`으로 갱신해야 함(D11). 실제 헤더: `등록번호(파일명)`,`생산일자`,`형태`,`생산자`,`분량`,`자료내용`,`제목`.
- **탭명 = 시리즈명**([build-data.mjs:128](../scripts/build-data.mjs#L128) `wb.SheetNames` 순회). 시트도 탭 이름을 시리즈명으로.
- **파생 규칙 6가지**(계층 인코딩·publicId·날짜 정규화·첫 행 dedupe·서브시리즈명 폴백·정렬)는 전부 입력부 **하류**라 소스가 시트로 바뀌어도 그대로.
- **`next.config.ts`에 `output:'export'` 없음** → Vercel 일반 배포라 Route Handler(`/api/refresh`)·Deploy Hook 사용 가능.
- **현재 데이터**: 198개(수업 110 / 원우회 37 / 교내활동 51), 서브시리즈 19개 **전부 코드 폴백**(SS1…). Cloudinary엔 200장 존재.

**Sheets API 호출 규약** (그대로 구현)
- 탭 발견: `GET https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}?fields=sheets.properties.title&key={KEY}`
- 일괄 읽기: `GET https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values:batchGet?ranges={탭1}&ranges={탭2}&ranges={탭3}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER&key={KEY}`
- 응답 `valueRanges[i].values` = 행 배열(0행=헤더). 헤더키 객체로 변환, 짧은 행은 `null` 패딩.
- 날짜 셀 = 시리얼 숫자 → 기존 `formatExcelDate(value, false)` 그대로(구글 시트=1900 에포크).

**⚠️ 이 머신 주의**: 시스템 Python `expat`(XML 파서) 깨짐 → Python으로 xlsx 파싱 금지. **Node + SheetJS**만 사용(현 빌드 방식).

---

## 3. 사용자가 준비할 것 (Phase 0 — 코드 시작 전 확인)

시작 시 아래를 사용자에게 확인:
- **Google Sheet** 생성·데이터 입력 완료 여부 (탭 3개 `수업/원우회/교내활동`, 헤더 1행 엑셀 그대로, **200행**: #2 정리 반영).
- **시트 공유** "링크 있는 모든 사용자 — 보기".
- **`GOOGLE_SHEET_ID`** (시트 URL의 `/d/{이것}/`).
- **`GOOGLE_SHEETS_API_KEY`** (GCP 발급, Sheets API 제한) → `.env.local`에 넣어뒀을 것.
- **`DEPLOY_HOOK_URL`** (Vercel → Settings → Git → Deploy Hooks, 브랜치 `main`).

**비밀값 취급**: `.env.local`/Vercel env/Secret 절대 커밋 금지. API 키·훅 URL을 코드·문서·채팅에 적지 말 것. `.gitignore`에 `.env*` 포함 확인.

---

## 4. 시작 절차

작업은 `develop` 브랜치에서. 커밋은 phase 단위(전역 메모 규칙).

**Phase 1 — 파이프라인 전환**
- `scripts/lib/sheets.mjs` 신규: `fetchSheetRows(sheetId, apiKey)` (§2 호출 규약). 실패 시 명확한 메시지로 `throw`.
- [scripts/build-data.mjs](../scripts/build-data.mjs) 입력 분기 교체(PLAN §3 Phase 1의 의사코드 그대로): key 있으면 fetch(실패=throw) / CI인데 key 없으면 throw / 로컬이면 기존 `collection.json` 두고 종료.
- `rowToFile`·`dedupeById`·`buildTree`·`publicFile`·`filename.mjs`는 **수정 금지**(재사용).
- **메타 스키마 갱신(D11)**: `COL`에서 `전자여부`→`분량`, [lib/types.ts](../lib/types.ts) `FileMeta.전자여부`→`분량`, [components/FileDetail.tsx:11](../components/FileDetail.tsx#L11) 라벨 `전자여부`→`분량`.
- `xlsx` 의존성 유지(`SSF.format`). `data/source/*.xlsx`는 더 이상 읽지 않음 — 참고용으로 보존(삭제 선택).
- 로컬에서 `GOOGLE_SHEET_ID`+`GOOGLE_SHEETS_API_KEY` 세팅 후 `npm run data` → **`totals.files=200`** 로그 확인.

**Phase 2 — 새로고침 버튼**
- `app/api/refresh/route.ts`: 서버에서 `process.env.DEPLOY_HOOK_URL`로 POST(훅 URL 비노출). 에러 핸들링·JSON 응답.
- `app/refresh/page.tsx`: 버튼 → `/api/refresh` 호출 → "약 1~2분 후 반영" 안내. 로딩/성공/실패 상태 표시.

**Phase 3 — 검증 & 문서**
- 로컬: 키 제거 시 폴백(스킵) 동작 확인.
- `develop` push → [release.yml](../.github/workflows/release.yml) 자동 병합 → 프로덕션 200개 확인.
- 시트 1칸 수정 → 새로고침 버튼 → 1~2분 후 반영 E2E 확인.
- [ISSUES.md](./ISSUES.md) #2 closed·#3 갱신, [이슈 문서](./ISSUE-gsheets-data-source.md)/[ADR 0002](./adr/0002-gsheets-buildtime-data-source.md) 최종 반영.

---

## 5. 절대 하지 말 것 / 주의

- ❌ **렌더링 모델 재선택**(ISR·런타임 등). SSG+빌드타임 fetch로 확정(D1).
- ❌ **fetch 실패 시 프로덕션에서 조용히 폴백**. CI는 빌드 실패가 맞음(D4).
- ❌ **파생 규칙/파서 하류 로직 수정**. 입력부 seam만 교체.
- ❌ **비밀값 커밋 / Python xlsx 파싱**.
- ❌ **시트에 비시리즈 탭 추가**(자동발견이 시리즈로 오인 — 필요 시 제외 로직 먼저).
- ✅ 불변 패턴·작은 파일·명시적 에러 처리(전역 CLAUDE.md). 커밋 컨벤션 `feat:`/`fix:`/`docs:`.
- ✅ Vercel env는 **Production·Preview 모두**에 키 설정(develop 프리뷰 빌드도 `prebuild` 실행).

---

## 6. 완료 정의 (Definition of Done)

- [x] `npm run data`가 시트에서 200개 생성, 키 없으면 폴백. — 로컬 검증 완료(2026-06-15).
- [x] 프로덕션이 시트 데이터로 200개 표시. — **검증 완료(2026-06-15)**: develop push → release.yml → main 배포. 라이브 SS14 라우트(`/S1/SS14/S1_SS14_01`) 200 + 정보창 `분량` 라벨 노출(구 `전자여부` 제거 확인).
- [ ] 새로고침 버튼 → 1~2분 내 시트 수정분 반영(훅 URL 비노출). — `/refresh` 페이지·`/api/refresh`(POST 전용) 라이브 확인. **남은 E2E(사용자)**: 시트 1칸 수정 → 버튼 클릭 → 1~2분 후 반영 확인.
- [x] 시트 fetch 실패 시 CI 빌드 실패. — 로컬 검증(키 누락 시 exit 1). 직전 배포 유지는 Vercel 네이티브 동작.
- [x] ISSUES.md #2 closed, #3·이슈 문서·ADR 0002 정합. — 완료(2026-06-15).
