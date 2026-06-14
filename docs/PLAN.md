# 아카이브 충돌 — 웹 초안 작업 계획

"신수찬 컬렉션" 아카이브 웹사이트 초안. SeMA(서울시립미술관) 아카이브 UI를 모사한 자료 브라우징 경험을 Next.js로 구축하고, 추후 'AI 판별' 오버레이를 끼워넣을 수 있도록 자리를 예약한다.

> 용어는 [CONTEXT.md](../CONTEXT.md), 배포 결정 근거는 [docs/adr/0001](./adr/0001-vercel-hobby-pat-merge-deploy.md) 참조.

---

## 1. 확정된 결정 요약 (grilling 결과)

| # | 주제 | 결정 |
|---|------|------|
| 1 | 콘텐츠 원본 | 엑셀 → 빌드 시 JSON 변환(정적 생성). 빈 필드는 폴백/플레이스홀더 |
| 2 | AI 판별 | **구현 보류.** 추후 별도 .xlsx 제공. 스키마 `ai` 필드 + 상세 뷰 자리만 예약 |
| 3 | 이미지 | 구글 드라이브 → 스크립트로 Cloudinary 일괄 업로드. 파일명=코드명이라 자동 매핑 |
| 4 | 빈 텍스트 | 메타데이터 5필드=플레이스홀더 / 제목·자료내용=엑셀 실연결(채워지면 자동 반영) / 서브시리즈명=엑셀에 열 추가해 추후 제공 |
| 5 | 레이아웃 | 그리드는 메인 영역. SeMA와 디자인·레이아웃 동일, **단 전역 헤더 제외** |
| 6 | 홈 버튼 | [C] 신수찬 컬렉션 헤더 상시 고정 = 홈 버튼 (헤더 제외분을 대신함) |
| 7 | 반응형 | 데스크톱 우선 + 모바일 기본대응(깨지지만 않게) |
| 8 | 랜딩 | 첫 진입·홈 클릭 시 컬렉션 표지(제목 중심). 소개 문구는 기획서에 없어 제외 |
| 9 | 배포 | Vercel 네이티브 연동(main=프로덕션). develop push → Action이 오너 PAT로 main 병합 → 자동 배포 |

---

## 2. 기술 스택 (권장값 — 이의 시 조정)

- **프레임워크**: Next.js 15 App Router + TypeScript
- **렌더링**: 전면 SSG (`generateStaticParams`로 시리즈/서브시리즈/파일 사전 생성). `output: 'export'`는 쓰지 않음 — Vercel 배포 + 추후 서버 기능(동적 AI 판별 가능성) 여지 유지
- **스타일**: Tailwind CSS (SeMA 클론에 유틸리티 방식이 빠름)
- **폰트**: Pretendard (`next/font/local` 또는 pretendard CDN)
- **이미지**: `next-cloudinary`의 `CldImage` (또는 next/image + Cloudinary loader)
- **엑셀 파싱**: SheetJS(`xlsx`) — 빌드 스크립트에서만 사용

---

## 3. 정보 구조 & 데이터 모델

### 3.1 계층
```
[C] 신수찬 컬렉션
├─ [S] 수업      (S1) — 서브시리즈 13개 / 파일 112개
├─ [S] 원우회    (S2) — 서브시리즈 3개  / 파일 37개
└─ [S] 교내활동  (S3) — 서브시리즈 3개  / 파일 51개
                         (총 서브시리즈 19개 / 파일 200개)
```
계층은 파일명 코드 `S{n}_SS{n}_{seq}.{ext}`에 인코딩됨.

### 3.2 엑셀 → JSON 빌드
- 원본 `.xlsx`를 `data/source/`에 커밋.
- `scripts/build-data.mjs`가 3개 시트(수업/원우회/교내활동)를 파싱 → `data/collection.json` 생성. `package.json`의 `prebuild` 훅으로 등록 → 매 빌드 시 최신 엑셀 반영(엑셀 교체 후 push만 하면 됨).
- 시트별 열: A 등록번호(파일명) · B 전자여부 · C 생산일자 · D 형태 · E 생산자 · F 자료내용 · G 제목 · (추가 예정) 서브시리즈명.

### 3.3 JSON 스키마(파일 단위)
```jsonc
{
  "id": "S1_SS1_01",            // 확장자 제거
  "fileName": "S1_SS1_01.png",  // 등록번호(파일명)
  "series": { "code": "S1", "name": "수업" },
  "subseries": { "code": "SS1", "name": "동기화된 감각과 물질" }, // 없으면 코드 폴백
  "title": null,                 // G열 — 채워지면 자동 표시, 없으면 등록번호로 폴백
  "date": "2024-11-23 19:54:02", // C열
  "content": null,               // F열
  "meta": {                      // 5필드 — 현재 플레이스홀더
    "전자여부": null, "형태": null, "생산자": null
  },
  "image": {
    "publicId": "archive-collision/S1/SS1/S1_SS1_01",
    "ext": "png"
  },
  "ai": null                     // ★ 보류 — 추후 xlsx 연결 지점
}
```
- 서브시리즈명은 해당 SS의 파일 행 중 첫 비어있지 않은 값으로 도출(없으면 코드 표시).
- 빌드 산출물에 시리즈/서브시리즈 인덱스(개수·정렬)도 포함해 트리·그리드에서 사용.

---

## 4. 이미지 파이프라인 (구글 드라이브 → Cloudinary)

1. 드라이브 폴더를 로컬로 1회 다운로드(파일명은 이미 코드명).
2. `scripts/upload-cloudinary.mjs`로 일괄 업로드 — `public_id = archive-collision/S{n}/SS{n}/{이름}`, `overwrite:true`, `unique_filename:false`.
3. 전송 변환: 썸네일 `c_fill,ar_1:1,g_auto,f_auto,q_auto` (정사각, 잘려도 무방 — PDF 명시), 상세 원본 `f_auto,q_auto,c_limit`.
4. **HEIC 1건**: 브라우저 미지원이지만 Cloudinary `f_auto`가 webp/jpg로 자동 변환 → 문제 없음.
5. JSON 빌드가 파일명 규칙으로 URL을 결정적으로 생성하므로 수작업 매핑 0.

> 환경변수: `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`(런타임), `CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET`(업로드 스크립트 전용, 로컬/시크릿).

---

## 5. 라우팅 & 컴포넌트 구조

### 5.1 라우트 (App Router)
```
/                         → 컬렉션 표지(랜딩)
/[series]/[subseries]     → 메인에 3열 썸네일 그리드
/[series]/[subseries]/[file] → 정보창(상세)
```
- 공통 `layout.tsx`에 **사이드바 트리 영속** + 메인 영역 슬롯.
- 모든 경로 SSG 사전 생성. 딥링크·새로고침 안전.

### 5.2 컴포넌트(개략)
- `SidebarTree` — [C] 고정 헤더(홈 링크) + 시리즈/서브시리즈 펼치기·접기(SeMA 스타일 인덴트·아이콘).
- `CollectionCover` — 랜딩. 컬렉션 제목 중심의 미니멀 표지(기획서에 없는 소개 문구는 넣지 않음).
- `FileGrid` — 3열(데스크톱)→2열(태블릿)→1~2열(모바일) 정사각 썸네일.
- `FileDetail` — 서브시리즈명 / [F]제목 / 메타데이터 2열 블록 / 자료내용 / `AiVerdictSlot`(예약).
- `AiVerdictSlot` — 지금은 빈 컨테이너 + "AI 판별 데이터 준비 중" 자리표시. 추후 데이터만 연결.

### 5.3 트리 상호작용
- [S] 클릭 → 서브시리즈 펼침(URL 변화 없음).
- [SS] 클릭 → 그리드로 이동.
- 썸네일 클릭 → 상세로 이동. 현재 위치는 트리에서 하이라이트.

---

## 6. UI / 디자인 (SeMA 매핑)

레퍼런스: `sema.seoul.go.kr/semaaa/front/archive/view.do` ([C] 김정헌 컬렉션) — PDF 스크린샷의 원본.

- **메타데이터 블록**: SeMA의 2열 레이아웃(레이블 굵게·값 보통). 우리 엑셀의 5필드(등록번호·전자여부·생산일자·형태·생산자)를 바인딩, 빈 값은 `—`. SeMA 전용 항목(수집처·분량·원본여부)은 데이터가 없으므로 기본 제외.
- **색/타이포**: 중립 회색·흰색 배경, 프리텐다드, 파란 링크. SeMA와 동일 톤.
- **SeMA에서 의도적으로 벗어나는 2가지**: ① 전역 헤더 제외, ② [C] 헤더 상시 고정·홈 버튼화.
- **푸터**: 최소 푸터(컬렉션/제작 정보). SeMA 푸터 톤 참고.

---

## 7. AI 판별 (보류 — 자리 예약 명세)

> 지금은 구현하지 않음. 추후 .xlsx 수령 시 아래 형태로 연결할 수 있도록 스키마·레이아웃만 준비.

PDF 기준 예상 형태(추후 확정):
- 이미지 위 트래킹 박스 3~5개, 색상(빨강/주황/초록·파랑) — 박스마다 번호 + 평가항목(동작감지·화질·반복성…).
- 박스와 같은 색의 판별 근거 문장(예: "~~한 이유로 이것은 생성된 것처럼 보입니다").
- 종합 수치 "~ 48% 정도 생성된 것으로 의심됩니다".
- 실시간 생성 연출(타이프라이터), 매번 박스 위치·크기에 약간의 랜덤성.

`FileDetail` 하단에 `AiVerdictSlot` 자리를 잡아 두어, 데이터·연출 로직을 나중에 무리 없이 삽입.

---

## 8. 배포 & CI/CD

[ADR 0001](./adr/0001-vercel-hobby-pat-merge-deploy.md) 참조.

- **브랜치**: `feature/*` → PR → `develop`(리뷰 게이트) → push 시 Action 자동 병합 → `main` → Vercel 프로덕션.
- **Vercel**: 레포 연결, 프로덕션 브랜치 = `main`. develop/PR은 프리뷰 자동.
- **GitHub Action** `release.yml` (트리거: `push: develop`):
  - `actions/checkout@v4` with `token: ${{ secrets.OWNER_PAT }}`
  - git author/committer를 오너로 설정
  - `develop` → `main` 병합 후 push (오너 명의 커밋 → Vercel 자동 배포)
- **브랜치 보호**: `main`은 Action(오너 PAT) 외 직접 푸시 차단.
- **시크릿**: `OWNER_PAT`(GitHub, main 보호 우회 푸시 권한).

---

## 9. 단계별 작업 계획

**Phase 0 — 스캐폴딩**
- Next.js(App Router·TS·Tailwind) 초기화, Pretendard 적용, 기존 PDF/xlsx를 `docs/`·`data/source/`로 정리.

**Phase 1 — 데이터 파이프라인**
- `scripts/build-data.mjs`(xlsx→JSON), 스키마 확정, `prebuild` 연결, 200건 파싱 검증.

**Phase 2 — 이미지 파이프라인**
- 드라이브 다운로드 → `scripts/upload-cloudinary.mjs` 업로드, `CldImage` 연동, 썸네일/원본 변환 확인(HEIC 포함).

**Phase 3 — 내비게이션 & 레이아웃**
- `SidebarTree`(고정 [C] 홈, 펼치기/접기), 영속 레이아웃, 라우팅(SSG).

**Phase 4 — 그리드 & 상세**
- `FileGrid`(3열 정사각), `FileDetail`(SeMA 메타 2열 + 자료내용), `AiVerdictSlot` 자리 예약, `CollectionCover` 랜딩.

**Phase 5 — 반응형 & 마감**
- 데스크톱 SeMA 정합 + 모바일 기본대응, 빈/누락 데이터 폴백 점검.

**Phase 6 — 배포 자동화**
- Vercel 연결, `release.yml`(PAT 병합), 브랜치 보호, develop→main→프로덕션 흐름 E2E 검증.

---

## 10. 추후 입력 대기 (사용자 제공 예정)

- [ ] AI 판별 데이터 .xlsx
- [ ] 메타데이터 5필드(전자여부·형태·생산자 등) 채운 엑셀
- [ ] 제목(G열)·자료내용(F열) 채운 엑셀
- [ ] 엑셀에 '서브시리즈명' 열 추가
- [ ] 구글 드라이브 이미지 200장 접근(다운로드)
- [ ] Cloudinary 계정/`cloud_name`·API 키
- [ ] 오너 GitHub PAT (Action 시크릿)

---

## 11. 제가 기본값으로 정한 것 (이의 있으면 말씀)

- 스타일: Tailwind / 폰트: Pretendard local
- 렌더링: SSG(정적 export 아님)
- 메타데이터: 엑셀 5필드만 노출, SeMA 전용 항목(수집처/분량/원본여부) 제외
- 라우팅: `/[series]/[subseries]/[file]` 형태
- 엑셀: 레포 커밋 + 빌드 시 파싱(엑셀 교체→push→자동 반영)
- 랜딩: 컬렉션 제목 중심 미니멀 표지(소개 문구 없음 — 기획서 외)
