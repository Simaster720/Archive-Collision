# AI 판별 본배선 + 0615 개선 — 작업 계획

> 목적: handoff 데모에서 **확정된 트래킹 박스 디자인**을 프로덕션 웹에 이식하고, `eval_results.xlsx`의 실제 판별 데이터를 빌드타임에 병합해 **전 자료(199장)에 인터랙티브 AI 판별**을 붙인다. 동시에 0615 요청(서브시리즈 이름·푸터 크레딧)을 처리한다.
>
> 근거 문서: [CONTEXT.md](../CONTEXT.md) · [ADR 0003 (박스 지터)](./adr/0003-tracking-box-jitter-client-side.md) · [ADR 0002 (데이터 소스)](./adr/0002-gsheets-buildtime-data-source.md) · [AI-VERDICT-HANDOFF-PLAN](./AI-VERDICT-HANDOFF-PLAN.md) · 출처: `아카이브 충동_0615 정리.pdf`, `신수찬 콜렉션_서브시리즈 이름.xlsx`, 클라이언트 대화(0615)

---

## 1. 확정된 결정 (grilling 결과)

| # | 항목 | 결정 |
|---|------|------|
| D1 | AI 판별 데이터 소스 | `data/source/eval_results.xlsx`를 **빌드타임 병합**(`파일명`→`id`). 박진혁 시트는 추후 동일 자리 교체 |
| D2 | 박스 시각 디자인 | **main `handoff/ai-verdict-demo/index.html` 확정본 이식**: `boxCount:6`·`filter:'signal'`·감점 선별, 색 빨강`#FF1F1F`(≥0.75)/주황`#FF9500`(≥0.50)/초록`#00E85F`(<0.50), `useDataColor:false`, 번호 제거, 짧은 영문 라벨+`%`, 단색배경 흰글씨, 2px solid, `edgeInsetPx:8`/`maxEdgeWideBoxes:1` |
| D3 | 컨테이너 톤 | **전체 라이트 톤**(다크 카드 미사용). 라이트 배경 위 초록/주황 점·텍스트 대비 미세조정 |
| D4 | 상세 레이아웃 | 상단 SeMA(서브시리즈명→[F]제목→메타데이터→자료내용) 유지 → **박스 오버레이 이미지 1장**(기존 원본 figure 제거) → **판별 근거 하단 풀폭** |
| D5 | 지터 모델 | **좌·우 모서리 독립 ±랜덤**(높이 고정), 진입마다 재생성, 전폭 박스 감쇄, **클라이언트 측·좌표 미저장** → ADR 0003 |
| D6 | 연출 흐름 | 박스+요약% **즉시** → 근거영역 **thinking ~2–3초**(GPT Thinking 풍) → 근거 **위→아래 순차 스트리밍**(행 라벨/% 즉시, 설명문장 타이핑) |
| D7 | 연출 재생 범위 | **매 진입 1회·루프 없음**. sessionStorage 억제 없음(지터 재랜덤과 일관) |
| D8 | 요약/판정 | **최종 % + 판정 배지**. 판정 = `final_score≥50 ? "AI 생성 의심" : "실제"` (시스템의 오답 판단을 그대로 노출 = 작업 핵심) |
| D9 | 서브시리즈 이름 | **커밋 매핑 파일** `data/subseries-names.json`(20개, `S{n}_SS{n}`→이름). 시트 `서브시리즈명` 컬럼 있으면 우선. 사이드바+상세 [SS] 동시 반영 |
| D10 | 푸터 크레딧 | 컬렉션명 유지 + `Thanks to / AI 판독 알고리즘 제작 : 박진혁 / 웹 개발 및 배포 : 신동민` |

---

## 2. 데이터 현실

- `eval_results.xlsx` = 1시트(`평가결과`), 행당 1이미지(≈200행). 핵심은 `특징JSON`.
- `특징JSON`: `image{width,height}` · `algo_score`/`gpt_score`/`final_score` · `features[35]`. 각 feature = 박스: `title`·`key`·`x1,y1,x2,y2`(원본 px)·`ensemble_score`·`score_pct`·`color`·`description`.
- `최종점수≥50` = AI 판정. 정답 라벨은 전부 "실제" → AI 판정(오답)은 진짜 사진 오인 = 개념 핵심.
- 박스 35개 중 ~25개 전체화면 영역 → 큐레이션 필수(D2 선별 파이프라인).
- 키 매핑: eval `파일명`(예: `S1_SS1_01.png`, 확장자 포함) ↔ collection `fileName`은 동일, `id`는 확장자 제거. `scripts/extract-ai-demo-data.mjs`의 매핑 로직 재사용.
- **eval 누락 자료**(HEIC 1장 등) 폴백: `file.ai = null` → 판별 카드 미렌더(또는 "데이터 없음" 처리). 빌드는 절대 깨지지 않게.

---

## 3. `file.ai` 스키마 (신규)

`lib/types.ts`의 `ai: null`을 다음으로 확장(빌드타임 산출, 원본 좌표만 — 지터는 표시 전용):

```ts
export interface VerdictBox {
  label: string;        // 짧은 영문 라벨 (예: "VIGNETTE")
  titleKo: string;      // 원본 한글 특징명
  scorePct: number;     // 의심도 %
  color: string;        // 임계값 기반 색 (#FF1F1F/#FF9500/#00E85F)
  description: string;  // 판별 근거 문장
  x1: number; y1: number; x2: number; y2: number;  // 원본 px (지터 전)
}
export interface AiVerdict {
  imageWidth: number; imageHeight: number;
  finalScore: number;                 // 0~100
  judgement: "ai" | "real";           // finalScore >= 50 ? "ai" : "real"
  boxes: VerdictBox[];                // 큐레이션된 ~6개 (선별·정렬·감점 완료)
}
// FileItem.ai: AiVerdict | null
```

선별/색/라벨 변환(`selectBoxes`·`colorFor`·`shortFeatureLabel`)은 handoff `index.html`에서 **빌드 스크립트(Node)** 로 포팅해 6개를 미리 확정한다(클라이언트는 표시·지터·연출만 담당).

---

## 4. 단계별 작업 (develop, 단계별 커밋)

| Phase | 내용 | 산출 |
|-------|------|------|
| **P1 빠른 개선** | `data/subseries-names.json` 추가 + `build-data.mjs`에 매핑 적용(시트 컬럼 우선). `Footer.tsx`에 Thanks to 크레딧. | 사이드바·상세 SS 이름, 푸터 |
| **P2 데이터 병합** | `lib/types.ts` `AiVerdict` 스키마. `build-data.mjs`(또는 분리 모듈)에서 `eval_results.xlsx` 읽어 id 매핑·`selectBoxes`/색/라벨 포팅 → `file.ai` 채움. 누락 폴백. | `collection.json`에 `ai` 채워짐 |
| **P3 정적 UI** | `AiVerdictSlot` → 실제 `AiVerdict` 컴포넌트. 라이트 톤 박스 오버레이(절대배치 % 스케일링), 요약%+판정 배지(상단), 근거 하단 풀폭. `FileDetail`에서 원본 figure 제거·판별 카드 하단 배치. **지터(좌우 독립 ±, 진입마다, 전폭 감쇄)**. | 정적 렌더 완성 |
| **P4 연출** | thinking 인디케이터(~2–3초) → 근거 순차 스트리밍(라벨/% 즉시, 설명 타이핑). 1회·루프 없음·매 진입 재생. 글자수 비례 청킹(cps 상수). `prefers-reduced-motion` 시 즉시 표시. | 타이핑 완성 |
| **P5 검증** | 빌드 통과, 다양 5장 시각 점검(초광각 `S3_SS2_05`·4K `S1_SS8_02`·소형 `S3_SS3_34`·정사각 `S1_SS1_01`·세로 `S2_SS2_04`), 모바일 하단 레이아웃, eval 누락 폴백, 지터 재랜덤·타이핑 1회 확인. | 검증 증거 |

---

## 5. 검증 기준 (P5)

- [ ] `npm run build` 통과, `collection.json` `ai` 채워짐(누락은 `null`, 빌드 안 깨짐).
- [ ] SS 이름 20개 사이드바+상세 정확 표기(코드 폴백 잔존 없음).
- [ ] 박스: 확정 색/라벨/번호제거, 라이트 배경 대비 OK, 전폭 박스 ≤1.
- [ ] 지터: 같은 자료 재진입마다 좌우 폭 달라짐. 저장 데이터엔 원본 좌표만.
- [ ] 연출: 박스+% 즉시, 근거 ~2–3초 후 위→아래 타이핑 1회. 재방문 재생. reduced-motion 즉시.
- [ ] 판정 배지: `S1_SS8_02`(8%) "실제", 나머지 다수 "AI 생성 의심" 대비 확인.
- [ ] 모바일: 하단 레이아웃 스크롤 정상, 푸터 크레딧 표기.

---

## 6. 범위 밖 / 추후

- ❌ 박진혁 Google Sheet 판별 파이프라인 — 추후 `file.ai` 소스 교체(D1).
- ❌ handoff 데모(`handoff/ai-verdict-demo/`) 추가 편집 — 디자인 확정 완료, 이식만.
- ⏭ 지터 폭·타이핑 cps·thinking 시간 정밀 튜닝은 시각 검토로 여러 버전 비교.
- ⏭ 한글 특징명 구어화 매핑 확장(현재 영문 짧은 라벨 + 한글 원본 보존).
