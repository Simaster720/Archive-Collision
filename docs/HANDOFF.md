# 핸드오프 — 아카이브 충돌 웹 초안

다른 세션에서 이 프로젝트를 **처음부터** 이어받기 위한 지시문. 먼저 아래 3개 문서를 순서대로 읽고 시작할 것.

1. [docs/PLAN.md](./PLAN.md) — 종합 작업 계획(스택·데이터 모델·파이프라인·라우팅·배포·6단계)
2. [CONTEXT.md](../CONTEXT.md) — 도메인 글로서리(용어 통일)
3. [docs/adr/0001](./adr/0001-vercel-hobby-pat-merge-deploy.md) — 배포 결정 근거

---

## 0. 한 줄 요약

"신수찬 컬렉션" 아카이브 웹사이트. **SeMA(서울시립미술관) 아카이브 UI를 모사한 자료 브라우징 사이트**를 Next.js로 만든다. 각 자료에 'AI 판별' 오버레이를 씌우는 게 작품의 개념이지만 **그 기능은 보류**(자리만 예약). 지금 만들 범위 = 사이드바 트리 + 파일 그리드 + 상세(정보창) + Cloudinary 이미지 + Vercel 자동배포.

레퍼런스(디자인·레이아웃 그대로 따를 것, **헤더만 제외**): `https://sema.seoul.go.kr/semaaa/front/archive/view.do?iId=22806&menuId=8`

---

## 1. 현재 레포 상태 (greenfield)

```
Archive-Collision/
├─ <아카이브 충돌>웹 요청.pdf   ← 원본 기획서(7쪽). 읽어볼 것
├─ 신수찬 콜렉션.xlsx           ← 자료 메타데이터 원본(아래 §2)
├─ README.md                    ← 한 줄뿐
├─ CONTEXT.md                   ← 작성됨
└─ docs/
   ├─ PLAN.md                   ← 작성됨
   ├─ HANDOFF.md                ← 이 문서
   └─ adr/0001-...md            ← 작성됨
```
아직 **Next.js 앱은 없음.** git: `origin/main` 존재, 브랜치 `main`. 코드는 한 줄도 없는 상태에서 Phase 0부터 시작.

---

## 2. 핵심 데이터 사실 (재조사 불필요 — 이미 분석함)

**엑셀 `신수찬 콜렉션.xlsx`**
- 시트 3개 = 시리즈 3개: `수업`(S1) / `원우회`(S2) / `교내활동`(S3)
- 열: A `등록번호(파일명)` · B `전자여부` · C `생산일자` · D `형태` · E `생산자` · F `자료내용` · G `제목`
- **채워진 열은 A·C 둘뿐.** B·D·E·F·G는 200행 전부 비어 있음.
- 파일명 코드: `S{시리즈}_SS{서브시리즈}_{순번}.{확장자}` (예: `S1_SS1_01.png`) — 계층이 파일명에 인코딩됨.

**규모**
- 총 파일 200개: 수업 112 / 원우회 37 / 교내활동 51
- 서브시리즈 19개: 수업 13(SS1~SS13) / 원우회 3 / 교내활동 3
- 수업 SS별 개수: SS1=5, SS2=6, SS3=3, SS4=2, SS5=6, SS6=7, SS7=12, SS8=17, SS9=3, SS10=4, SS11=18, SS12=15, SS13=14
- 원우회: SS1=14, SS2=20, SS3=3 / 교내활동: SS1=9, SS2=8, SS3=34
- 확장자: jpg 151 / png 46 / jpeg 2 / **heic 1** (HEIC는 Cloudinary `f_auto`가 자동 변환 → 문제 없음)

**⚠️ 파싱 주의**: 이 머신의 시스템 Python은 `expat`(XML 파서)이 깨져 있음 → Python으로 xlsx 파싱 시도하지 말 것. **Node + SheetJS(`xlsx`)**로 파싱(이게 빌드 스크립트 방식이기도 함).

---

## 3. 확정된 결정 (grilling 완료 — 번복 금지, 상세는 PLAN §1)

- **콘텐츠 원본**: 엑셀 → 빌드 시 JSON 변환(정적 생성). 빈 필드 폴백.
- **빈 텍스트 처리**: 메타 5필드=플레이스홀더(`—`) / 제목(G)·자료내용(F)=엑셀 실연결(채워지면 자동 반영) / 서브시리즈명=엑셀에 열 추가해 추후 제공(없으면 코드 폴백).
- **이미지**: 구글 드라이브 → 스크립트로 Cloudinary 일괄 업로드. 파일명=코드명이라 자동 매핑. `public_id = archive-collision/S{n}/SS{n}/{이름}`.
- **레이아웃**: 그리드는 메인 영역. SeMA와 동일, **헤더 제외**. `[C] 신수찬 컬렉션` 상시 고정 헤더 = 홈 버튼.
- **반응형**: 데스크톱 우선 + 모바일 기본대응.
- **랜딩**: 컬렉션 제목 중심 미니멀 표지. **소개 문구 없음**(기획서 외 항목이라 지어내지 말 것).
- **AI 판별**: ★ **전면 구현 보류.** 상세 뷰에 `AiVerdictSlot` 자리 + 스키마 `ai:null` 필드만 예약. 추후 별도 .xlsx로 데이터 제공 예정.
- **배포**: Vercel 네이티브(main=프로덕션). `develop` push → Action이 오너 PAT로 main 병합 → 자동 배포. 게이트는 develop 진입 PR.

**기본값(거부 없으면 확정, PLAN §11)**: Next.js 15 App Router + TS / Tailwind / Pretendard / SSG(정적 export 아님) / `next-cloudinary`.

---

## 4. 사용자가 준비 완료한 것 + 다음 세션이 확인할 것

사용자가 "다 준비했다"고 함. 시작 시 아래를 확인:
- **Cloudinary**: `cloud_name`/API 키 → `.env.local`에 넣어뒀을 것. 파일 존재 확인(`NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`). 없으면 사용자에게 요청.
- **이미지 200장**: 구글 드라이브에서 로컬로 내려받았을 것. **로컬 폴더 경로를 사용자에게 물어볼 것**(파일명은 코드명).
- **GitHub PAT**: GitHub 레포 Secret `OWNER_PAT`에 등록돼 있을 것(Phase 6에서 사용). 값은 채팅에 노출 금지.

**비밀값 취급**: `.env.local`/Secret은 절대 커밋 금지. `.gitignore`에 `.env*` 포함 확인. API Secret·PAT를 코드/문서에 적지 말 것.

---

## 5. 시작 절차

작업은 `develop` 브랜치에서. (`git checkout -b develop`)

**Phase 0 — 스캐폴딩**
- 루트에 Next.js 초기화(App Router·TS·Tailwind·ESLint). 기존 파일(PDF·xlsx) 유지하며 충돌 없게 셋업.
- 원본 자산 정리: `신수찬 콜렉션.xlsx` → `data/source/`, PDF → `docs/`.
- Pretendard 적용(`next/font/local` 또는 CDN). `.gitignore`에 `.env*`·`node_modules` 확인.

**Phase 1 — 데이터 파이프라인**
- `scripts/build-data.mjs`: SheetJS로 3시트 파싱 → `data/collection.json`(스키마는 PLAN §3.3). 서브시리즈명은 해당 SS 첫 비어있지 않은 값, 없으면 코드. `package.json` `prebuild` 훅 등록. 200건 파싱 검증.

**Phase 2 — 이미지 파이프라인**
- 사용자에게 받은 이미지 폴더 경로로 `scripts/upload-cloudinary.mjs` 작성·실행(`public_id` 규칙·`overwrite:true`). `CldImage` 연동. 썸네일 `c_fill,ar_1:1,g_auto,f_auto,q_auto` / 원본 `f_auto,q_auto`. HEIC 표시 확인.

**Phase 3 — 내비게이션 & 레이아웃**
- `SidebarTree`(고정 [C] 홈 + 시리즈/서브시리즈 펼치기·접기, SeMA 인덴트·아이콘), 영속 `layout.tsx`, 라우팅 `/`·`/[series]/[subseries]`·`/[series]/[subseries]/[file]` 전부 SSG.

**Phase 4 — 그리드 & 상세**
- `FileGrid`(3열 정사각), `FileDetail`(SeMA 메타 2열 + 자료내용 + `AiVerdictSlot` 예약), `CollectionCover`(미니멀 표지).

**Phase 5 — 반응형 & 마감**
- 데스크톱 SeMA 정합 + 모바일 기본대응, 빈/누락 데이터 폴백 점검.

**Phase 6 — 배포 자동화**
- Vercel 레포 연결(프로덕션=main, env에 `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`). `.github/workflows/release.yml`(트리거 `push: develop`, `checkout` with `secrets.OWNER_PAT`, git author=오너, develop→main 병합 push). `main` 브랜치 보호 + PAT bypass 허용. develop→main→프로덕션 E2E 검증.

---

## 6. 절대 하지 말 것 / 주의

- ❌ **AI 판별 로직/연출 구현** — 자리·스키마 필드만. 데이터는 추후 제공.
- ❌ **없는 콘텐츠 지어내기** — 표지 소개 문구, 가짜 메타데이터 텍스트 등. 비면 플레이스홀더(`—`).
- ❌ **비밀값 커밋**. ❌ **Python으로 xlsx 파싱**(파서 깨짐 → Node/SheetJS).
- ✅ 코딩 스타일: 불변(immutable) 패턴, 작은 파일(200~400줄), 명시적 에러 처리(전역 CLAUDE.md 규칙 준수).
- ✅ 작업은 `develop`에서. 커밋 메시지 `feat:`/`fix:` 등 컨벤션.

---

## 7. 추후 사용자 제공 예정 (없어도 진행 가능)

- AI 판별 데이터 .xlsx / 메타 5필드·제목·자료내용 채운 엑셀 / 서브시리즈명 열. 모두 엑셀 교체 후 push만 하면 빌드가 자동 반영(파이프라인을 그렇게 설계).
