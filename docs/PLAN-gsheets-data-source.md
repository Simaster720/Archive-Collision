# 작업 계획: 데이터 소스 전환 — 빌드타임 엑셀 → Google Sheets 조회

> **상태**: ✅ 구현 완료 (2026-06-15) — grilling 완료·결정 확정 → Phase 1·2 구현·로컬 검증. 배포는 Vercel env 설정 후.
> **작성일**: 2026-06-14
> **이슈**: [docs/ISSUE-gsheets-data-source.md](./ISSUE-gsheets-data-source.md) · **핸드오프**: [docs/HANDOFF-gsheets.md](./HANDOFF-gsheets.md) · **ADR**: [docs/adr/0002](./adr/0002-gsheets-buildtime-data-source.md)
> **기준 데이터**: `data/source/신수찬 콜렉션_0614_수정.xlsx` (198행, `[F]` 접두어 최신본)

---

## 0. 한 줄 요약

최종본 확정 전까지 **Google Sheets를 단일 데이터 소스**로 둔다. **SSG 구조는 그대로 유지**하고, `build-data.mjs`가 엑셀 파일 대신 Sheets API로 데이터를 읽어 `collection.json`을 만든다. 작가/기획자는 시트를 고친 뒤 **"새로고침" 버튼**(Vercel Deploy Hook)을 눌러 1~2분 내 반영한다. 코드 변경은 **바이트가 들어오는 한 지점**에 집중되고, 파생 규칙 6가지·`collection.json`·라우팅은 무손실 보존된다.

---

## 1. 확정된 결정 (grilling 완료 — 번복 금지)

| # | 항목 | 결정 | 근거 |
|---|------|------|------|
| D1 | 렌더링 모델 | **SSG 유지 + 빌드타임 fetch** | 임시 운용·되돌리기 용이, [lib/collection.ts](../lib/collection.ts) 정적 구조 보존 |
| D2 | 접근/인증 | **Sheets API v4 + API 키**, 시트 "링크 있는 모든 사용자 — 보기" 공유 | 공식·견고, 탭 이름 batchGet, `UNFORMATTED`로 날짜 코드 보존, 키는 빌드타임 전용(클라이언트 미노출) |
| D3 | 반영 트리거 | **Vercel Deploy Hook = "새로고침" 버튼** | git 왕복 제거, 게시 캐시 없이 즉시, ADR 0001 게이트와 무관 |
| D4 | fetch 실패 정책 | **CI/Vercel = 빌드 실패(폴백 없음)** / 로컬 = 커밋된 `collection.json` 폴백 | 프로덕션 "조용한 stale" 차단, Vercel이 직전 정상 배포 유지 |
| D5 | `collection.json` | **커밋 유지** (시드·폴백·오프라인·정적 import 대상) | Deploy Hook 빌드는 라이브 시트로 재생성, 커밋본은 안전망 |
| D6 | 데이터 정합성 #2 | **시트에서 200개로 정리** (유령 SS13 `.png` 2행 삭제 + SS14 2행 추가) | 재구축 시점이 자연스러운 정리 타이밍, Cloudinary엔 이미 200장 |
| D7 | 이미지 | **Cloudinary 진실원천 유지**, 시트엔 등록번호만 | 이슈 §6 |
| D8 | AI 판별 데이터 | **별개 소스·범위 외** (`eval_results.xlsx`는 이번 전환 무관) | 이슈 §8 권장 |
| D9 | 탭/스키마 | **탭 3개 = 시리즈 3개(시리즈명 그대로), 헤더 = `_수정.xlsx` 그대로** | 파서 "탭명=시리즈명" 유지. 단 헤더는 수정본 기준(D11) |
| D10 | 서브시리즈명 | **옵션 `서브시리즈명` 열 유지**(비면 코드 폴백, 현 동작) | 현재 19개 전부 코드 폴백 상태, 채우면 자동 반영 |
| D11 | 메타 스키마 | **수정본 따름 — `분량` 채택, `전자여부` 제거.** 정보창 메타 = 형태·생산자·분량 | `_수정.xlsx`가 전자여부 삭제·분량 추가(198/200)·형태/생산자/제목 전부 채움. 소스 진실원천(작가 최신 의도) 따름 |

---

## 2. 변경의 핵심 (단 하나의 seam)

```
현재:  data/source/*.xlsx ──readFileSync──► XLSX.read ──► rows ──► rowToFile/dedupe/buildTree ──► collection.json
변경:  Google Sheet ──Sheets API fetch──►  rows  ────────────────┘ (이하 전부 동일)
```

- **건드리는 곳**: `build-data.mjs`의 입력부(`findWorkbook` + `readAllFiles`의 XLSX 읽기)뿐.
- **그대로 보존**: `rowToFile` · `dedupeById`(첫 행 우선) · `buildTree`(정렬) · `publicFile` · [scripts/lib/filename.mjs](../scripts/lib/filename.mjs)(계층 인코딩·publicId) · [lib/collection.ts](../lib/collection.ts) · 양 라우트 `generateStaticParams`.
- **날짜**: `valueRenderOption=UNFORMATTED_VALUE` + `dateTimeRenderOption=SERIAL_NUMBER` → 날짜 셀이 시리얼 숫자로 옴 → 기존 [build-data.mjs:51](../scripts/build-data.mjs#L51) `formatExcelDate(value, false)` 그대로 동작. (구글 시트는 1900 에포크 = `date1904=false`.) `xlsx` 의존성은 `SSF.format` 위해 유지.

---

## 3. 단계별 작업

### Phase 0 — 준비 (수동 / 사용자)
1. **Google Sheet 생성** — 탭 3개를 시리즈명 그대로: `수업` / `원우회` / `교내활동`.
   ⚠️ **정확히 이 3개 탭만.** 비시리즈 탭(메모·매핑 등)을 추가하면 파서가 시리즈로 오인함.
2. **1행 = `_수정.xlsx` 헤더 그대로**(D11): `등록번호(파일명)`, `생산일자`, `형태`, `생산자`, `분량`, `자료내용`, `제목`, (옵션)`서브시리즈명`. ⚠️ `전자여부` 없음, `분량` 있음. → `_수정.xlsx`를 그대로 임포트하면 이 구성이 자동으로 들어옴(Google 네이티브 임포트가 날짜도 보존).
3. **데이터**: `_수정.xlsx` 200행(= 198 고유 + 유령 2) → **#2 정리** → **200 고유**
   - 삭제: 수업 탭의 유령 `S1_SS13_01.png` · `S1_SS13_02.png` (진짜는 같은 번호 `.JPG`, 디스크에도 `.JPG`만 존재)
   - 추가: `S1_SS14_01.png` · `S1_SS14_02.png` (Cloudinary에 이미 업로드됨; 등록번호만 채우고 제목·형태·생산자·분량은 작가가 채움)
4. **공유**: "링크 있는 모든 사용자 — 보기"(API 키 읽기 조건). 편집은 지정 인원만.
5. **GCP API 키**: 발급 → Sheets API로 키 제한.
6. **Vercel Deploy Hook**(브랜치 `main`) 생성 → URL 확보.

### Phase 1 — 빌드 파이프라인 전환 (코드)
- **신규** `scripts/lib/sheets.mjs`: `fetchSheetRows(sheetId, apiKey)`
  - 탭 자동발견: `GET …/v4/spreadsheets/{id}?fields=sheets.properties.title&key=…`
  - 일괄 읽기: `GET …/v4/spreadsheets/{id}/values:batchGet?ranges={탭}&…&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER&key=…`
  - 응답 `valueRanges[i].values`(행 배열, 0행=헤더) → **헤더키 객체 배열**로 변환(현 `sheet_to_json` 출력과 동형). 짧은 행은 헤더 인덱스 기준 `null` 패딩.
  - 실패 시 명확한 메시지로 `throw`.
- [scripts/build-data.mjs](../scripts/build-data.mjs) 입력 분기 교체:
  ```
  const key = process.env.GOOGLE_SHEETS_API_KEY;
  const isCI = process.env.CI || process.env.VERCEL;
  if (key)        → fetchSheetRows(SHEET_ID, key)   // 실패 시 throw → 빌드 실패
  else if (isCI)  → throw "GOOGLE_SHEETS_API_KEY required in CI"   // 키 누락도 빌드 실패
  else            → 커밋된 collection.json 존재 확인 후 그대로 두고 종료(오프라인 dev)
  ```
  이후 `rowToFile`/`dedupeById`/`buildTree` 재사용.
- **메타 스키마 갱신(D11)** — 3곳 소규모 수정:
  - [scripts/build-data.mjs](../scripts/build-data.mjs) `COL`: `전자여부` 제거, `분량: "분량"` 추가.
  - [lib/types.ts](../lib/types.ts) `FileMeta`: `전자여부` → `분량`(`string | null`). (값이 숫자 `1`이라도 `clean()`이 문자열화)
  - [components/FileDetail.tsx:11](../components/FileDetail.tsx#L11) 메타 행: `전자여부` 라벨 → `분량`.
- **env**: `GOOGLE_SHEET_ID`(비밀 아님), `GOOGLE_SHEETS_API_KEY`(비밀) → `.env.local` + **Vercel(Production·Preview 모두)**. develop 프리뷰 빌드도 `prebuild`를 돌리므로 Preview에도 키 필요.

### Phase 2 — 새로고침 버튼
- `app/api/refresh/route.ts` (Route Handler): 서버에서 `DEPLOY_HOOK_URL`(비밀)로 POST → **훅 URL 클라이언트 비노출**.
- `app/refresh/page.tsx`: "사이트 새로고침" 버튼 → `/api/refresh` 호출 + "약 1~2분 후 반영" 안내.
- 보안: 누구나 `/api/refresh`로 빌드를 유발할 수 있음(저트래픽 작품 사이트라 허용). 추후 간단한 패스프레이즈로 강화 가능.
- 제로코드 대안: 북마클릿/단축어로 훅 직접 POST(URL 노출 감수).

### Phase 3 — 검증 & 마감
- 로컬: 키 세팅 → `npm run data` → 로그 `totals.files=200` 확인.
- 로컬: 키 제거 → 기존 `collection.json` 유지(스킵) 동작 확인.
- `S1_SS14_01/02` Cloudinary publicId 존재 확인.
- `develop` push → [release.yml](../.github/workflows/release.yml) → main 배포 → 프로덕션 200개 확인.
- 시트 1칸 수정 → 새로고침 버튼 → 1~2분 후 반영 확인.
- 문서: [ISSUES.md](./ISSUES.md) #2 closed / #3 갱신, [이슈 문서](./ISSUE-gsheets-data-source.md) Accepted, [ADR 0002](./adr/0002-gsheets-buildtime-data-source.md) 반영.

---

## 4. 리스크 / 주의

- **탭 자동발견은 정확히 3개 시리즈 탭 전제** — 비시리즈 탭 추가 시 제외 로직 필요.
- **Deploy Hook은 ADR 0001 게이트와 무관** — 코드 배포는 여전히 develop→main 오너 병합 게이트를 통과하고, 새로고침 버튼은 *이미 배포된 main을 데이터만 갱신*하는 별개 트리거. ADR 0001이 배포 게이트용으로 Deploy Hook을 *기각*한 것과 모순 아님(용도가 다름). 상세는 [ADR 0002](./adr/0002-gsheets-buildtime-data-source.md).
- **API 키**: 빌드타임 전용, SSG는 결과 HTML만 배포하므로 클라이언트에 키가 실리지 않음. GCP에서 Sheets API로 제한.
- **시트 공개 범위**: "링크 보기"는 사실상 공개 — 데이터는 어차피 공개 아카이브 콘텐츠라 허용. 완전 비공개가 필요해지면 서비스 계정으로 승격(ADR 0002 대안 참고).

## 5. 범위 / 비범위

- **범위**: 콘텐츠 메타데이터(자료 계층) 소스를 시트로 전환 + 새로고침 버튼 + #2 정리(200개).
- **비범위**: AI 판별 데이터(`eval_results.xlsx`)는 별개 소스로 유지. 최종본 확정 후 정적(xlsx/JSON) 회귀 여부는 추후 결정.
