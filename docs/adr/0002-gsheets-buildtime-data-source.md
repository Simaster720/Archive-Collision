# 콘텐츠 데이터 소스를 (임시로) Google Sheets로 두고 빌드타임에 조회한다

> 상태: Accepted (2026-06-14) · **구현 완료 (2026-06-15)** · 관련: [ADR 0001](./0001-vercel-hobby-pat-merge-deploy.md) · [PLAN](../PLAN-gsheets-data-source.md) · [ISSUE](../ISSUE-gsheets-data-source.md)

## 맥락

자료 메타데이터(엑셀)가 최종본 확정 전까지 계속 수정된다. 현재는 빌드타임 정적 구조라 한 번 고치려면 `xlsx 교체 → commit → push → 재배포`가 필요하고, "원본 vs 수정본" 혼선이 실제로 발생했다. 비개발자(작가·기획)가 직접 고쳐도 무거운 절차 없이 반영되어야 한다.

소비 계층은 100% 정적이다: `lib/collection.ts`가 `collection.json`을 정적 import하고 전 라우트가 `generateStaticParams`로 SSG된다. 파싱 파이프라인(`build-data.mjs`)은 이미 헤더명 기반이라 바이트 소스만 바꾸면 되도록 설계돼 있다.

## 결정

- **최종본 확정 전까지** 콘텐츠 메타데이터의 단일 소스를 **Google Sheets**로 둔다(임시).
- 웹은 **SSG를 유지**한다. `build-data.mjs`가 빌드타임에 **Sheets API v4를 API 키로** 조회해 `collection.json`을 생성한다. 시트는 "링크 있는 모든 사용자 — 보기"로 공유한다.
- 작가의 반영 트리거는 **Vercel Deploy Hook("새로고침" 버튼)** — git 왕복 없이 main을 재빌드해 라이브 시트 데이터를 굽는다.
- **fetch 실패 정책**: CI/Vercel 빌드에서는 키 누락·조회 실패 시 **빌드를 실패**시킨다(Vercel이 직전 정상 프로덕션 배포를 유지). 로컬 개발은 키가 없으면 커밋된 `collection.json`으로 폴백한다.
- `collection.json`은 **커밋을 유지**한다(시드·폴백·오프라인·정적 import 대상). Deploy Hook 빌드는 이를 라이브 데이터로 재생성하지만 되커밋하지는 않는다.
- 파생 규칙 6가지·라우팅·`filename.mjs`·이미지(Cloudinary)는 변경하지 않는다.

## 고려한 대안

- **ISR / 런타임 서버 fetch**: 재배포를 완전히 제거하지만 `lib/collection.ts`와 라우트를 async로 개편해야 하고 런타임 폴백 설계가 필요하다. 임시 운용·되돌리기 관점에서 과함.
- **게시(Publish to web) CSV**: 키 불필요하나 탭별 URL(gid) + 게시 캐시 ~5분 지연 → "새로고침 직후 옛 데이터"로 버튼 신뢰가 깨짐.
- **gviz JSON**: 키 불필요하나 비공식 포맷·날짜 `Date(y,m,d)`·포맷 변경 위험.
- **서비스 계정 JSON 키**: 시트를 완전 비공개로 둘 수 있어 가장 견고하나, 계정·키·공유 설정·`googleapis` 의존성까지 셋업/해체 비용이 커 임시 기능엔 과함.
- **Deploy Hook을 코드 배포 게이트로**: ADR 0001이 이미 기각함("오너 명의" 게이트가 사라짐). 본 ADR의 Deploy Hook은 *이미 배포된 main의 데이터만 갱신*하는 별개 용도라 모순되지 않는다.

## 결과

- 새 빌드타임 비밀값 `GOOGLE_SHEETS_API_KEY`와 `DEPLOY_HOOK_URL`을 Vercel env/Secret으로 관리한다(Production·Preview 모두). 키는 SSG 결과 HTML에 실리지 않아 클라이언트에 노출되지 않는다. GCP에서 Sheets API로 키를 제한한다.
- 시트가 "링크 보기"로 사실상 공개된다 — 데이터가 공개 아카이브 콘텐츠라 허용. 완전 비공개가 필요해지면 서비스 계정으로 승격.
- 코드 배포 게이트는 여전히 `develop` 진입 PR + develop→main 오너 병합(ADR 0001). 데이터 갱신만 Deploy Hook로 분리된다.
- 변경 이력은 Google Sheets 버전 기록 + 가끔 커밋되는 `collection.json` 스냅샷으로 추적한다(엄밀한 버전관리는 아님).
- 시트 탭은 정확히 3개(시리즈)여야 한다 — 비시리즈 탭은 파서가 시리즈로 오인하므로 추가 시 제외 로직이 선행돼야 한다.
- 최종본 확정 후 정적(xlsx/JSON)으로 회귀할지 유지할지는 추후 결정. 회귀는 입력부 seam만 되돌리면 되도록 설계했다.

## 구현 메모 (2026-06-15)

결정대로 구현·로컬 검증 완료. 변경은 입력부 한 지점에 집중됐고 파생 규칙·라우팅·`filename.mjs`·이미지는 무수정.

- **신규** [scripts/lib/sheets.mjs](../../scripts/lib/sheets.mjs) — `fetchSheetRows(sheetId, apiKey)`: 탭 자동발견(`fields=sheets.properties.title`) → `values:batchGet`(`UNFORMATTED_VALUE`+`SERIAL_NUMBER`) → 헤더키 객체 배열(짧은 행 `null` 패딩). 실패 시 명확한 메시지로 `throw`.
- [build-data.mjs](../../scripts/build-data.mjs) 입력 분기: 키 있으면 시트 fetch(실패=throw) / CI·Vercel인데 키 없으면 throw / 로컬이면 커밋된 `collection.json` 유지. 날짜는 1900 에포크라 `formatExcelDate(v, false)` 재사용.
- **D11 메타 스키마**: `전자여부` 제거·`분량` 채택 — `COL`·[lib/types.ts](../../lib/types.ts) `FileMeta`·[components/FileDetail.tsx](../../components/FileDetail.tsx) 정보창 라벨 갱신.
- **새로고침 버튼**: [app/api/refresh/route.ts](../../app/api/refresh/route.ts)(서버에서 `DEPLOY_HOOK_URL` POST, 훅 URL 비노출) + [app/refresh/page.tsx](../../app/refresh/page.tsx)(로딩/성공/실패 상태).
- `npm run data`: `--env-file=.env.local`로 키 로드. `prebuild`(Vercel)는 주입된 env 사용.

**검증(로컬)**: 시트에서 `totals.files=200`(수업 112 / 원우회 37 / 교내활동 51, 서브시리즈 20) 생성 · `npm run build` 그린(226 static pages, `/api/refresh`=동적) · 키 제거 시 폴백(스킵) · CI 키 누락 시 빌드 실패(exit 1) · Cloudinary SS13=jpeg·SS14=png 실재 확인. **배포·새로고침 E2E**는 Vercel env(Production·Preview) 설정 후 검증.
