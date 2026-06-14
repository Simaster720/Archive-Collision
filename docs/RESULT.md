# 작업 결과 보고서 — 아카이브 충돌(신수찬 컬렉션) 웹 초안

> 작성일 2026-06-14 · 브랜치 `develop`(→ `main` 자동 병합) · 상태 **라이브 배포 완료**
> 🔗 프로덕션: **https://archive-collision.vercel.app**

SeMA(서울시립미술관) 아카이브 UI를 모사한 "신수찬 컬렉션" 자료 브라우징 사이트. 기획서·[PLAN](./PLAN.md)의 6단계를 모두 구현하고 Vercel 프로덕션 배포까지 E2E 검증을 마쳤다. 'AI 판별' 기능은 계획대로 **자리·스키마만 예약**하고 구현은 보류했다.

---

## 1. 한눈에 보기

| 항목 | 결과 |
|------|------|
| 단계 | Phase 0–6 전부 완료 |
| 라이브 URL | https://archive-collision.vercel.app (HTTP 200, 공개) |
| 정적 페이지 | **221개** SSG 사전 생성(표지 1 + 서브시리즈 19 + 파일 198 + 시스템) |
| 표시 자료 | **198 파일** / 3 시리즈 / 19 서브시리즈 |
| 이미지 | **200장** Cloudinary 업로드(HEIC 1장 포함, `f_auto`로 webp 변환 확인) |
| 빌드/린트 | `next build` 성공 · ESLint 0 경고 |
| 배포 자동화 | develop push → GitHub Action(오너 PAT) → main 병합 → Vercel 자동배포 (검증 완료) |

---

## 2. 기술 스택 (실제 적용)

- **프레임워크**: Next.js `16.2.9` (App Router, Turbopack) — PLAN의 "15" 권장값을 최신 안정 버전으로 상향
- **언어/스타일**: TypeScript `5` · Tailwind CSS `v4` · Pretendard(CDN dynamic-subset)
- **렌더링**: 전 경로 SSG(`generateStaticParams` + `dynamicParams=false`) — 미지정 경로 404
- **이미지**: Cloudinary 업로드 + 딜리버리(`getCldImageUrl`로 URL 생성, `f_auto`/`q_auto`/`c_fill`)
- **데이터**: SheetJS(`xlsx 0.20.3`)로 엑셀 파싱 (빌드 스크립트 전용)
- React `19.2.4` · cloudinary(서버 SDK) `2.10.0` · next-cloudinary `6.17.5`

---

## 3. 단계별 산출물

### Phase 0 — 스캐폴딩
- Next.js 16 초기화(App Router·TS·Tailwind·ESLint), 루트 정리
- 원본 자산 이동: 엑셀 → `data/source/`, 기획서 PDF → `docs/`
- Pretendard 적용, SeMA 중립 톤 `globals.css`(다크모드 제거), `.gitignore`(`.env*`·`node_modules`·로컬 이미지 폴더)

### Phase 1 — 데이터 파이프라인
- `scripts/build-data.mjs`: 3시트 파싱 → `data/collection.json`(collection→series→subseries→files 중첩 트리)
- `scripts/lib/filename.mjs`: 등록번호↔계층 파싱 공유 모듈(업로드 스크립트와 규칙 공유)
- 헤더명 기준 컬럼 매핑(컬럼 추가/이동에 견고), 생산일자 정규화(`yyyy-mm-dd hh:mm:ss`)
- 중복 등록번호 dedupe(첫 행 우선 + 경고, 빌드 비중단), `prebuild` 훅으로 빌드마다 엑셀 자동 반영

### Phase 2 — 이미지 파이프라인
- `scripts/upload-cloudinary.mjs`: 로컬 폴더 → Cloudinary 일괄 업로드(`public_id=archive-collision/S{n}/SS{n}/{id}`, `overwrite`, 동시성 8, `--dry-run`/`--limit`)
- `lib/cloudinary.ts`: 썸네일(`c_fill,ar1:1,g_auto`)·상세(`c_limit`) 딜리버리 헬퍼
- `next.config`: `res.cloudinary.com` 허용. 200장 업로드 완료(HEIC 변환 HTTP 검증)

### Phase 3 — 내비게이션 & 레이아웃
- `components/SidebarTree.tsx`: SeMA 분류 트리. 검은 `[C]` 헤더=홈 버튼(상시 고정), `[S]`/`[SS]` 라벨 + `+/−` 토글, 활성 하이라이트
- `app/layout.tsx`: 영속 사이드바 + 메인 슬롯(데스크톱 2열 / 모바일 스택)
- `lib/types.ts`·`lib/collection.ts`: 타입 + 조회/정적파라미터 헬퍼
- 라우트 `/[series]/[subseries]`, `/[series]/[subseries]/[file]` 전부 SSG

### Phase 4 — 그리드 & 상세
- `FileGrid`: 정사각 썸네일 3열(가로 최대 3), 파일명 대신 원본 이미지 표시
- `FileDetail`: 서브시리즈명 → `[F]` 제목 → 메타데이터 5필드(`└` 마커) → 자료 내용 → 원본 이미지(중앙) → AI 판별 영역
- `AiVerdictSlot`: AI 판별 **보류 자리**(스키마 `ai:null`만 예약, 가짜 결과 미생성)
- `CollectionCover`: 미니멀 표지(제목 중심, 소개 문구 없음)

### Phase 5 — 반응형 & 마감
- 모바일 사이드바 햄버거(☰) 드로어(네비 시 자동 닫힘), 데스크톱 상시 노출
- 최소 푸터(`components/Footer.tsx`), 빈/누락 데이터 폴백(제목→id, 메타→`—`, 자료내용 없으면 숨김, 빈 그리드 메시지)

### Phase 6 — 배포 자동화
- `.github/workflows/release.yml`: develop push → 오너 PAT로 develop→main `--no-ff` 병합(오너 명의 커밋 → Vercel 자동배포). PAT 계정 정보로 git identity 설정, concurrency 직렬화
- `docs/DEPLOY.md`: Vercel 연결/env/Secret/브랜치보호/E2E 가이드

---

## 4. 데이터 현황

| 시리즈 | 코드 | 파일 | 서브시리즈 |
|--------|------|------|------------|
| 수업 | S1 | 110 | 13 (SS1–SS13) |
| 원우회 | S2 | 37 | 3 |
| 교내활동 | S3 | 51 | 3 |
| **합계** | | **198** | **19** |

- 엑셀 메타데이터는 세션 중 사용자가 갱신(`신수찬 콜렉션_0614.xlsx`): **제목·형태·생산자 198/198**, 자료내용 일부, 전자여부 미입력(플레이스홀더 `—`).
- Cloudinary에는 실제 이미지 **200장** 보관(미표시 2장 = 아래 §6 참조).

---

## 5. PLAN 대비 변경/결정 사항

1. **Next 16 채택** — `create-next-app` 최신이 16 설치. PLAN "15"는 조정 가능 항목이라 최신 안정 버전으로 진행.
2. **CldImage → 일반 `<img>` + `getCldImageUrl`** — `<CldImage>` 컴포넌트가 Next16/React19에서 런타임 비호환(`useState` 프리렌더 에러). PLAN이 허용한 대안으로 전환(동일 딜리버리 변환, 그리드는 서버 컴포넌트 유지).
3. **표시 198건(현재 엑셀 기준)** — 사용자 지시(확정 아님, 추후 엑셀 수정 시 자동 반영).
4. 세션 중 추가된 `_0614.xlsx`(채워진 정본)를 확정, 구버전 빈 엑셀 제거. `findWorkbook`은 복수 xlsx 시 결정적 선택 + 경고.

---

## 6. 보류 / 추후 처리 (상세: [docs/ISSUES.md](./ISSUES.md))

1. **엑셀 ↔ 이미지 불일치** — 유령 `S1_SS13_01/02.png` 2행(이미지 없음, dedupe 제외) + `S1_SS14_01/02.png` 2장(엑셀 미등재, 미표시). 이미지는 Cloudinary에 있으므로 엑셀에 행 추가만 하면 200건으로 자동 확장.
2. **`S1_SS11_01.JPG` 축소본** — Cloudinary 무료 플랜 10MB 한도 초과로 5000×3750 재압축 업로드. 원본은 로컬에 보존. 유료 플랜 시 원본 재업로드 가능.
3. **AI 판별** — 전면 보류(자리·스키마만). 추후 별도 `.xlsx` 수령 시 `file.ai` + `AiVerdictSlot`에 연결.

---

## 7. 운영 가이드

| 명령 | 설명 |
|------|------|
| `npm run dev` | 로컬 개발 서버 |
| `npm run data` | 엑셀 → `collection.json` 재생성 |
| `npm run build` | 프로덕션 빌드(`prebuild`에서 data 자동 생성) |
| `npm run upload` | 로컬 이미지 → Cloudinary (`-- --dry-run` 미리보기) |
| `npm run lint` | ESLint |

**갱신 플로**: `feature/*` → PR → `develop` push → (자동) main 병합 → Vercel 프로덕션. 엑셀/이미지 교체도 동일하게 push만 하면 반영.

---

## 8. 배포 E2E 검증 (실측)

```
develop push ──▶ GitHub Action "Release (develop → main)" 성공(9초)
            ──▶ main tip = "release: merge develop into main" (author: Simaster720, 오너)
            ──▶ Vercel 프로덕션 빌드 success
            ──▶ https://archive-collision.vercel.app
```

| 검증 | 결과 |
|------|------|
| `/` 표지+사이드바 | 200 ✅ |
| `/S1/SS1` 그리드 | 200 ✅ (`c_fill` 썸네일) |
| `/S1/SS1/S1_SS1_01` 상세 | 200 ✅ (`[F]`제목·메타·자료내용·AI슬롯·`c_limit` 이미지) |
| `/S3/SS3/S3_SS3_07` HEIC | 200 ✅ |
| 실제 썸네일 응답 | `200 image/webp` ✅ |

> 참고: 배포별 URL과 팀 별칭은 Vercel Authentication으로 보호(401)되며, 공개 도메인은 `archive-collision.vercel.app`이다.

---

## 9. 산출 파일 구조

```
app/
  layout.tsx · page.tsx · globals.css
  [series]/[subseries]/page.tsx                 # 그리드
  [series]/[subseries]/[file]/page.tsx          # 상세
components/
  SidebarTree · FileGrid · FileDetail · CollectionCover · AiVerdictSlot · Footer
lib/
  types.ts · collection.ts · cloudinary.ts
scripts/
  build-data.mjs · upload-cloudinary.mjs · lib/filename.mjs
data/
  source/신수찬 콜렉션_0614.xlsx                # 콘텐츠 소스(커밋)
  collection.json                               # 빌드 산출물(커밋)
docs/
  PLAN · HANDOFF · DEPLOY · ISSUES · RESULT · adr/0001 · 기획서 PDF
.github/workflows/release.yml                   # develop→main 자동 병합
```

커밋(`develop`, 8개): Phase 0–6 + 단일 엑셀 보장 fix. 모두 `feat:`/`fix:`/`chore:` 컨벤션.
