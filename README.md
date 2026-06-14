# 아카이브 충돌 — 신수찬 컬렉션

SeMA(서울시립미술관) 아카이브 UI를 모사한 "신수찬 컬렉션" 자료 브라우징 사이트. 각 자료에 'AI 판별' 오버레이를 씌우는 것이 작업의 개념이며, 그 기능은 현재 보류(자리·스키마만 예약)다.

- **스택**: Next.js 16(App Router) · TypeScript · Tailwind v4 · Pretendard
- **데이터**: 엑셀(`data/source/*.xlsx`) → 빌드 시 `data/collection.json` 생성(SSG)
- **이미지**: 로컬 → Cloudinary 업로드, 딜리버리 변환(`f_auto`/`q_auto`/`c_fill`)
- **렌더링**: 전 경로 SSG (컬렉션 표지 / 서브시리즈 그리드 / 파일 상세)

## 빠른 시작

```bash
npm install
npm run dev          # http://localhost:3000
```

`.env.local`에 Cloudinary 값이 필요하다(이미지 업로드 스크립트용):

```
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=...   # 런타임(이미지 딜리버리)에도 사용
CLOUDINARY_API_KEY=...                  # 업로드 스크립트 전용
CLOUDINARY_API_SECRET=...               # 업로드 스크립트 전용
```

## 명령어

| 명령 | 설명 |
|------|------|
| `npm run dev` | 개발 서버 |
| `npm run data` | 엑셀 → `data/collection.json` 재생성 |
| `npm run build` | 프로덕션 빌드(`prebuild`에서 data 자동 생성) |
| `npm run upload` | 로컬 이미지 → Cloudinary 업로드 (`-- --dry-run` 미리보기) |
| `npm run lint` | ESLint |

## 구조

```
app/                     # 라우트(layout, 표지, /[series]/[subseries], /…/[file])
components/              # SidebarTree, FileGrid, FileDetail, AiVerdictSlot, …
lib/                     # 타입, collection 로더, Cloudinary 딜리버리 헬퍼
scripts/                 # build-data.mjs(엑셀→JSON), upload-cloudinary.mjs
data/source/             # 원본 엑셀(콘텐츠 소스)
docs/                    # PLAN, HANDOFF, ADR, DEPLOY, ISSUES
```

## 문서

- [docs/PLAN.md](docs/PLAN.md) — 작업 계획(스택·데이터 모델·라우팅·6단계)
- [CONTEXT.md](CONTEXT.md) — 도메인 용어 글로서리
- [docs/DEPLOY.md](docs/DEPLOY.md) — Vercel + develop→main 자동 배포
- [docs/ISSUES.md](docs/ISSUES.md) — 보류/추후 처리 항목
- [docs/adr/0001](docs/adr/0001-vercel-hobby-pat-merge-deploy.md) — 배포 결정 근거
