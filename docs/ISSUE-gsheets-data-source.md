# 이슈: 데이터 소스를 빌드타임 엑셀 → Google Sheets 조회로 전환

> **상태**: ✅ 구현 완료 (2026-06-15) — §4 열린 질문 전부 해소(grilling 완료) → Phase 1·2 구현·로컬 검증. **계획**: [PLAN-gsheets-data-source.md](./PLAN-gsheets-data-source.md) · **핸드오프**: [HANDOFF-gsheets.md](./HANDOFF-gsheets.md) · **결정 근거**: [adr/0002](./adr/0002-gsheets-buildtime-data-source.md)
> **작성일**: 2026-06-14 · **결정 확정**: 2026-06-14
> **기준 데이터**: `data/source/신수찬 콜렉션_0614_수정.xlsx` (198행, `[F]` 제목 접두어 포함 최신본)
> **관련**: [scripts/build-data.mjs](../scripts/build-data.mjs) · [lib/collection.ts](../lib/collection.ts) · [lib/types.ts](../lib/types.ts) · [docs/ISSUES.md](./ISSUES.md) #2 · [docs/adr/0001](./adr/0001-vercel-hobby-pat-merge-deploy.md) · `.github/workflows/release.yml`

---

## 1. 배경 / 동기

- 자료 메타데이터(엑셀)가 **최종본 확정 전까지 계속 수정**될 예정.
- 현재는 **빌드타임 정적** 구조라, 데이터를 한 번 바꾸려면 `xlsx 교체 → commit → push → 재배포`가 필요하다. 번거롭고, 실제로 "원본 vs 수정본" 혼선이 발생했다(아래 §2 마지막 줄, 직전 세션 확인).
- **목표**: 최종 확정 전까지 **Google Sheets를 단일 데이터 소스**로 두고, 웹이 시트 데이터를 조회해 표기한다. 비개발자(작가·기획)가 시트에서 직접 고치면 무거운 재배포 없이(또는 가벼운 재검증으로) 반영되게 한다.

## 2. 현재 상태 (As-is)

**데이터 흐름**
```
data/source/*.xlsx
   └─(prebuild) scripts/build-data.mjs ──► data/collection.json
                                              └─ lib/collection.ts (정적 import)
                                                   └─ generateStaticParams → 전 라우트 SSG
이미지: 별개 파이프라인 — Cloudinary (publicId = archive-collision/S{n}/SS{n}/{id})
```

- **소비 계층**: `lib/collection.ts`가 `data/collection.json`을 **정적 import**한다 → 사이드바/그리드/상세 전 라우트가 **빌드타임 SSG**. 런타임 데이터 패칭 없음.
- **소비 스키마**(`lib/types.ts`의 `CollectionData`): `컬렉션 → 시리즈 → 서브시리즈 → 파일`. 파일 필드:
  `id, fileName, series{code,name}, subseries{code,name}, title, date, content, meta{전자여부,형태,생산자}, image{publicId,ext}, ai(예약,null)`.
- **소스 컬럼**(엑셀 헤더, `build-data.mjs`의 `COL`): `등록번호(파일명)`, `제목`, `생산일자`, `자료내용`, `전자여부`, `형태`, `생산자`, `서브시리즈명`(옵션).
- **반드시 보존해야 할 파생 규칙**(현재 `build-data.mjs`/`lib/filename.mjs`에 있음):
  1. 등록번호 = 파일명 = 계층 인코딩 `S{n}_SS{n}_{seq}.{ext}`,
  2. Cloudinary publicId = `archive-collision/S{n}/SS{n}/{id}`,
  3. `생산일자` 혼합형(엑셀 시리얼/텍스트) → `yyyy-mm-dd hh:mm:ss` 정규화,
  4. 같은 id 중복 행 → **첫 행 우선 dedupe**(경고),
  5. `서브시리즈명` 없으면 코드(`SS1`)로 폴백,
  6. 시리즈/서브시리즈/순번 정렬.
- **배포**: `develop` push → `release.yml`이 `main`에 `--no-ff` 병합 → Vercel 자동 배포. 빌드 시 `prebuild`가 **커밋된 xlsx로 collection.json을 재생성**한다.
- **직전 확인**: 현재 웹 = **원본 `신수찬 콜렉션_0614.xlsx` 기준**. `_수정.xlsx`는 미추적이라 원격/Vercel에 없고, 차이는 **제목 12건의 `[F]` 접두어**(자료내용 등 나머지 동일).

## 3. 제안 방향 (To-be, 개요만)

- `신수찬 콜렉션_0614_수정.xlsx` 내용을 **Google Sheet로 이관**해 단일 소스화.
- 웹이 Google Sheets에서 데이터를 조회 → `CollectionData`로 매핑해 표기.
- **임시 운용**(최종본 확정 전). 확정 후 정적(xlsx/JSON)으로 되돌릴지 유지할지는 추후 결정.

## 4. 결정 필요 사항 (✅ 해소됨)

> 아래 열린 질문은 모두 결정됨 → [PLAN §1 결정 로그](./PLAN-gsheets-data-source.md#1-확정된-결정-grilling-완료--번복-금지) / [ADR 0002](./adr/0002-gsheets-buildtime-data-source.md) 참조.
> 요약: 1=SSG 빌드타임 fetch · 2=Sheets API v4 + API 키(링크 보기) · 3=엑셀 헤더/탭 그대로 · 4=CI 빌드 실패 정책(런타임 폴백은 SSG라 불필요) · 5=`collection.json` 커밋 유지(시드/폴백) · 6=Cloudinary 유지 · 7=#2를 시트에서 200개로 정리 · 8=AI 판별 분리 · 9=링크공유+지정 편집자.

1. **조회 시점 / 렌더링 모델**
   빌드타임 fetch(SSG, 변경 시 재배포) · ISR(`revalidate` N초) · 런타임 서버 fetch · 클라이언트 fetch 중 무엇? 정적 사이트 성격·속도·SEO 트레이드오프, 현 SSG(`generateStaticParams`)와의 호환.
2. **접근 / 인증 방식**
   Google Sheets API v4(서비스 계정 JSON 키) · 게시된 CSV/gviz JSON(공개 링크·키 불필요) · Apps Script 웹앱 중 무엇? **시크릿은 서버 전용 env**로, `NEXT_PUBLIC_*` 노출 금지(서버 라우트 경유).
3. **스키마 / 시트 구조 매핑**
   시트 컬럼 = 엑셀 헤더 그대로 유지? 탭 구성(시리즈별 탭 vs 단일 탭)? §2의 **파생 규칙 6가지를 시트 파서로 이식**(계층 인코딩·dedupe·날짜 정규화·서브시리즈명 폴백).
4. **캐싱 / 안정성 / 폴백**
   재검증 주기, Google API rate limit, **실패 시 폴백**(마지막 정상 스냅샷 또는 커밋된 `collection.json`) — 시트 일시 오류로 빌드/페이지가 깨지지 않게.
5. **빌드 파이프라인 영향**
   `build-data.mjs`/`collection.json`을 **유지**(시트→JSON 스냅샷을 빌드 산출)할지, **폐기**할지. `prebuild`·`release.yml`과의 관계 재정의.
6. **이미지 연동**
   시트엔 **등록번호만**, 이미지는 기존 Cloudinary publicId 규칙 유지(시트는 이미지의 진실 원천 아님).
7. **데이터 정합성 동반 정리**
   [ISSUES.md](./ISSUES.md) #2(엑셀↔이미지 불일치: `S1_SS13_*` 유령 행, `S1_SS14_*` 누락)를 시트 이관 시 함께 정리할지.
8. **범위 경계**
   AI 판별 데이터(`eval_results.xlsx`, 시트 `평가결과`)는 **별개 소스** — 이번 전환에 포함할지(권장: 분리).
9. **운영**
   시트 편집 권한·실수 방지·수정 이력(버전 관리), 누가 무엇을 고치는지.

## 5. 범위 / 비범위

- **이 문서**: 이슈·맥락·결정 필요사항 기술만.
- **비범위**: 구현, 상세 설계, 일정, ADR 작성 → **다음 세션**.

## 6. 다음 세션 시작 입력 (참고 포인터)

- 기준 데이터: `data/source/신수찬 콜렉션_0614_수정.xlsx`
- 파싱 규약: `scripts/build-data.mjs`, `scripts/lib/filename.mjs`
- 소비 스키마: `lib/collection.ts`, `lib/types.ts`
- 이미지 URL 규칙: `lib/cloudinary.ts`
- 배포 자동화: `.github/workflows/release.yml`, `docs/adr/0001-vercel-hobby-pat-merge-deploy.md`
- 데이터 이슈: `docs/ISSUES.md` #2
