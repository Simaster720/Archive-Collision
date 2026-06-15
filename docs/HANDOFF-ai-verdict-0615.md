# 핸드오프 — AI 판별 본배선 + 0615 개선

다른 세션에서 이 작업을 이어받기 위한 지시문. 먼저 아래 문서를 순서대로 읽고 시작할 것.

1. [docs/PLAN-ai-verdict-0615.md](./PLAN-ai-verdict-0615.md) — 작업 계획(결정 D1–D10·단계 P1–P5·`file.ai` 스키마·검증)
2. [docs/adr/0003](./adr/0003-tracking-box-jitter-client-side.md) — 박스 지터 결정 근거(**박스를 "고정"하지 말 것**) / [docs/adr/0002](./adr/0002-gsheets-buildtime-data-source.md) — 데이터 소스 맥락
3. [docs/AI-VERDICT-HANDOFF-PLAN.md](./AI-VERDICT-HANDOFF-PLAN.md) — handoff 데모 배경·`특징JSON`·CONFIG 설명
4. [CONTEXT.md](../CONTEXT.md) — 도메인 글로서리(트래킹 박스·AI 판별 항목 = 이번 작업의 진실원천)

---

## 0. 한 줄 요약

handoff 데모에서 **작가가 확정한 박스 디자인**(main 브랜치)을 프로덕션에 이식하고, `eval_results.xlsx`를 빌드타임에 병합해 199장에 **인터랙티브 AI 판별**(박스 오버레이 + 지터 + thinking→타이핑 + 판정 배지)을 붙인다. 곁들여 0615 요청(SS 이름·푸터 크레딧) 처리. 모든 설계 결정은 grilling 완료(PLAN §1) — **번복 금지**.

---

## 1. 확정된 결정 (재논의 불필요 — PLAN §1 요약)

- **D1** AI 판별 데이터 = `data/source/eval_results.xlsx` **빌드타임 병합**. (박진혁 시트는 추후 동일 자리 교체)
- **D2** 박스 디자인 = **main `handoff/ai-verdict-demo/index.html` 확정본 이식**. 새로 디자인하지 말 것.
- **D3** **전체 라이트 톤** — 다크 카드 쓰지 말 것.
- **D4** 상세 = 상단 SeMA 유지 → **박스 이미지 1장**(기존 원본 figure 제거) → **근거 하단 풀폭**.
- **D5** 지터 = **좌·우 모서리 독립 ±랜덤**(높이 고정), 진입마다 재생성, 전폭 감쇄, **클라 측·좌표 미저장**(ADR 0003).
- **D6** 연출 = 박스+요약% **즉시** → 근거 **thinking ~2–3초** → **위→아래 순차 타이핑**.
- **D7** 연출 재생 = **매 진입 1회·루프 없음**(sessionStorage 억제 없음).
- **D8** 요약 = **최종 % + 판정 배지**(`final_score≥50`→"AI 생성 의심", 미만→"실제").
- **D9** SS 이름 = **커밋 매핑 파일**(시트 `서브시리즈명` 컬럼 있으면 우선).
- **D10** 푸터 = 컬렉션명 + `Thanks to / AI 판독 알고리즘 제작 : 박진혁 / 웹 개발 및 배포 : 신동민`.

---

## 2. 핵심 기술 사실 (재조사 불필요 — 이미 분석함)

### 2.1 ⚠️ 확정 디자인은 main에 있다 (develop 아님)

`handoff/ai-verdict-demo/index.html`이 **develop엔 옛 버전, origin/main엔 확정본**이다. 시작 전:
```
git fetch origin main
git show origin/main:handoff/ai-verdict-demo/index.html   # 확정 CONFIG·selectBoxes·색·라벨 원본
```
develop의 같은 파일을 보고 디자인을 추측하지 말 것.

### 2.2 확정 CONFIG 값 (main)

```
boxCount: 6, filter: 'signal', sortBy: 'score', skipNullScore: true
useDataColor: false
colorScale: [≥0.75 #FF1F1F(빨강), ≥0.50 #FF9500(주황), ≥0.00 #00E85F(초록)]
showNumber: false, showTitle: true(짧은 영문 라벨), showPct: true, labelPosition: 'inside-tl', labelSize: 11
edgeInsetPx: 8, maxEdgeWideBoxes: 1
borderWidth: 2, borderStyle: 'solid', borderRadius: 0, cornerStyle: 'plain', fillOpacity: 0
라벨 스타일: background: var(--c) 단색, color: #fff, 형식 "LABEL | 48%"
```

### 2.3 포팅 대상 함수 (main index.html → Node 빌드 스텝)

선별을 빌드타임에 끝내 `file.ai.boxes`에 ~6개만 담는다(클라는 표시·지터·연출만):
- `selectBoxes(image)` — 필터(signal=전체화면 제외) → 큰/넓은/가장자리 박스 **감점**(`_rankScore`) → 점수 정렬 → 중첩 `overlapRatio>0.55` 제외 → 전폭 박스 `maxEdgeWideBoxes:1` → 부족 시 `>0.72`로 완화 충전 → 6개 컷.
- `featureMetrics`, `overlapRatio`, `isFullFrame` — 위 보조.
- `colorFor(f)` — `ensemble_score` 임계값→색(useDataColor:false).
- `shortFeatureLabel(f)` — 한글 특징명→영문 짧은 라벨 **딕셔너리**(예: 비네팅→VIGNETTE, 헤일로 아티팩트→HALO). 딕셔너리 전체가 main index.html에 있음 — 그대로 복사.
- 스케일링: `left=x1/W`, `top=y1/H`, `width=(x2-x1)/W`, `height=(y2-y1)/H` (% 변환, 컨테이너 `position:relative` + 박스 `position:absolute`). `edgeInsetPx`·전폭 여유는 `buildBox` 참조.

### 2.4 데이터 흐름 / 병합 키

```
data/source/eval_results.xlsx ─XLSX.read─► 행별 특징JSON ─(파일명→id)─► selectBoxes/colorFor/shortLabel
                                                                            └─► file.ai (AiVerdict) ─► collection.json
```
- eval `파일명` = `S1_SS1_01.png`(**확장자 포함**). collection `fileName`도 확장자 포함, `id`는 제거. `scripts/lib/filename.mjs`의 `parseRegistration`로 정규화. `scripts/extract-ai-demo-data.mjs`가 이미 같은 매핑을 함 — 재사용.
- `특징JSON` 구조: `image{width,height}` · `final_score` · `features[35]{title,key,x1,y1,x2,y2,ensemble_score,score_pct,color,description}`. 형식: [data/source/출력형식_설명.txt](../data/source/출력형식_설명.txt).
- `xlsx`(SheetJS)는 이미 의존성(`build-data.mjs`가 `XLSX.SSF` 사용).
- **eval 누락 자료**(HEIC 1장 등): `file.ai = null` → 판별 카드 미렌더. **빌드는 절대 깨지지 않게**.

### 2.5 `file.ai` 스키마 (lib/types.ts — 현재 `ai: null`)

```ts
interface VerdictBox { label, titleKo, scorePct, color, description, x1,y1,x2,y2 }  // 좌표=원본 px(지터 전)
interface AiVerdict { imageWidth, imageHeight, finalScore, judgement: "ai"|"real", boxes: VerdictBox[] }
// FileItem.ai: AiVerdict | null
```

### 2.6 건드릴 파일

| 파일 | 변경 |
|------|------|
| `lib/types.ts` | `ai: null` → `AiVerdict \| null` + 스키마 |
| `scripts/build-data.mjs` (+ 분리 모듈 권장) | eval 병합·선별 포팅·`file.ai` 채움 |
| `data/subseries-names.json` (신규) | SS 이름 매핑(§3) |
| `components/AiVerdictSlot.tsx` | 플레이스홀더 → 실제 `AiVerdict` 컴포넌트(박스 오버레이·지터·thinking·타이핑·판정 배지) |
| `components/FileDetail.tsx` | 원본 `<figure>`(현 70–82행) 제거, 판별 카드 하단 배치 |
| `components/Footer.tsx` | Thanks to 크레딧 |
| `components/SidebarTree.tsx` | **변경 없음**(이미 `sub.name` 사용) |
| `app/[series]/[subseries]/[file]/page.tsx` | **변경 없음**(이미 resolved `sub.name` 전달) |

> SS 이름은 빌드가 `name`을 resolve하면 사이드바·상세·브레드크럼이 **자동 반영**된다(컴포넌트 수정 불필요).

---

## 3. 사용자가 준비할 것 / 즉시 쓸 데이터

### 3.1 `data/subseries-names.json` (이미 확보 — 아래 20개 그대로 생성)

`신수찬 콜렉션_서브시리즈 이름.xlsx`에서 추출한 확정 매핑(`S{n}_SS{n}` → 이름):

| 코드 | 이름 | | 코드 | 이름 |
|------|------|---|------|------|
| S1_SS1 | 동기화된 감각과 물질 | | S1_SS11 | 전시매체연구-동시대 융복합 예술과 전시 미디어 |
| S1_SS2 | 디자인 워크샵 | | S1_SS12 | 피지컬컴퓨팅 조형실험 |
| S1_SS3 | 미디어아트 논문세미나 | | S1_SS13 | Foundation Tools-TouchDesigner |
| S1_SS4 | 미디어아트와 시공간확장(2024) | | S1_SS14 | MFA 파운데이션 |
| S1_SS5 | 미디어아트와 시공간확장(2025) | | S2_SS1 | 전공대표(25-1) |
| S1_SS6 | 미디어아트와 전시-아카이브 실천 | | S2_SS2 | 원우회장(25-2) |
| S1_SS7 | 백남준과 융합예술 | | S2_SS3 | 대학원총연합회(26-1) |
| S1_SS8 | 비디오아트와 확장형식 | | S3_SS1 | 기타 교내 사진 |
| S1_SS9 | 영화미디어와 시네마틱사운드 | | S3_SS2 | 연세대학교 140주년 미디어파사드 |
| S1_SS10 | 예술과 미디어에콜로지 | | S3_SS3 | 커뮤니케이션대학원 25주년 기념 행사 |

⚠️ SS 코드는 시리즈마다 반복(모든 시리즈에 SS1 존재)되므로 **반드시 `S{n}_SS{n}` 풀패스로 키잉**할 것.

### 3.2 환경

- `eval_results.xlsx`는 이미 레포에 있음(`data/source/`). 추가 수령 불필요.
- 빌드 시 `GOOGLE_SHEETS_API_KEY`/`GOOGLE_SHEET_ID`(`.env.local`)는 메타데이터용 — 기존대로(ADR 0002).
- **시작 전 `git fetch origin main` + main의 handoff index.html 확보**(§2.1).

---

## 4. 시작 절차 (develop, 단계별 커밋)

1. **P1 빠른 개선** — `data/subseries-names.json`(§3.1) 생성 → `build-data.mjs`에서 resolve 시 매핑 적용(시트 컬럼 우선, 없으면 매핑, 둘 다 없으면 코드). `Footer.tsx`에 Thanks to. → `npm run build`로 SS 이름·푸터 확인. 커밋.
2. **P2 데이터 병합** — `lib/types.ts` 스키마. eval 읽기·§2.3 선별 포팅·id 매핑·`file.ai` 채움·누락 폴백. → `collection.json` `ai` 채워짐 확인. 커밋.
3. **P3 정적 UI** — `AiVerdictSlot`→실제 컴포넌트(라이트 톤 박스 오버레이·% 스케일링·요약/판정 배지 상단·근거 하단). `FileDetail` 원본 figure 제거. **지터**(좌우 독립 ±·진입마다·전폭 감쇄). 커밋.
4. **P4 연출** — thinking 인디케이터(~2–3초) → 근거 순차 스트리밍(라벨/% 즉시, 설명 타이핑). 1회·매 진입 재생. `prefers-reduced-motion` 즉시 표시. 커밋.
5. **P5 검증** — DoD(§6) 전 항목.

---

## 5. 절대 하지 말 것 / 주의

- ❌ **박스를 매 조회마다 고정/안정화하지 말 것** — 지터는 의도(ADR 0003). 변형 좌표를 데이터에 저장하지 말 것(원본 px만 저장, 지터는 표시 전용).
- ❌ **데모의 `enableJitter`(연속 떨림)·`enableAnimation`(요약 타이프+박스 순차)을 그대로 쓰지 말 것** — 클라 스펙과 다름. 박스는 즉시 등장(애니메이션 없음), 타이핑은 **근거**에만.
- ❌ **다크 카드로 만들지 말 것**(D3). ❌ 박스 디자인을 새로 정하지 말 것 — main 확정본 이식.
- ❌ `SidebarTree`/상세 페이지에 SS 이름 하드코딩하지 말 것 — 빌드 resolve로 자동 반영.
- ⚠️ **색 대비**: 확정 색(`#00E85F`·`#FF9500`)은 다크 배경 기준. 라이트 톤에서 근거 리스트의 점/텍스트 가독성 약하면 점은 유지·텍스트만 약간 어둡게(또는 테두리) 보정 — 시안으로 사용자 확인.
- ⚠️ `prefers-reduced-motion`: thinking·타이핑 생략하고 즉시 완성본 표시.
- ⚠️ 빌드 견고성: eval 누락·점수 null 박스에도 빌드 통과(폴백).

---

## 6. 완료 정의 (Definition of Done)

- [ ] `npm run build` 통과. `collection.json` `ai` 채워짐(누락=`null`, 빌드 안 깨짐).
- [ ] SS 이름 20개 사이드바·상세·브레드크럼 정확(코드 폴백 잔존 0).
- [ ] 박스: main 확정 색/짧은영문라벨/번호제거, 라이트 위 대비 OK, 전폭 박스 ≤1.
- [ ] 지터: 같은 자료 재진입마다 좌우 폭 변동. 저장 데이터엔 원본 좌표만.
- [ ] 연출: 박스+% 즉시 → 근거 ~2–3초 후 위→아래 타이핑 1회. 재방문 재생. reduced-motion 즉시.
- [ ] 판정 배지: `S1_SS8_02`(8%)="실제", 다수="AI 생성 의심" 대비 확인.
- [ ] 모바일: 하단 레이아웃 스크롤 정상. 푸터 Thanks to 표기.
- [ ] 다양 5장 시각 점검: 초광각 `S3_SS2_05`·4K `S1_SS8_02`·소형 `S3_SS3_34`·정사각 `S1_SS1_01`·세로 `S2_SS2_04`.
