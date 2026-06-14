# AI 판별 바운딩 박스 — 작가 핸드오프 데모 작업 계획

> 목적: **AI 탐지 트래킹 박스의 시각 디자인**을 작가가 (코딩 에이전트와 함께) 직접 확정할 수 있도록, `data/source/eval_results.xlsx`의 실제 판별 데이터로 5개 이미지를 렌더하는 **단독 HTML 데모**를 만든다. 작가가 확정한 디자인을 추후 웹에 이식한다.
>
> ⚠️ **현재 배포 웹에는 적용하지 않는다.** 이 산출물은 `app/` 밖에 두어 Vercel 배포에 포함되지 않는 별도 핸드오프 아티팩트다. 용어는 [CONTEXT.md](../CONTEXT.md), 데이터 형식은 [출력형식_설명.txt](../data/source/출력형식_설명.txt) 참조.

---

## 1. 확정된 결정 (grilling 결과)

| # | 주제 | 결정 |
|---|------|------|
| 1 | 편집 방식 | **편집 가능한 코드 예시**. 작가 + 코딩 에이전트가 HTML을 직접 수정. 상단 `CONFIG` + CSS 변수 블록이 디자인 면 |
| 2 | 박스 선별 | **큐레이션 + 토글**. 기본은 신호 있는 소수 박스, `boxCount`·`filter`·`showAll` 변수로 3/5/전체(35) 조절 |
| 3 | 파일 구성 | **단일 HTML + 공유 디자인 서페이스**. 5장을 한 파일에 세로 나열, 디자인 한 번 고치면 5장 동시 반영 |
| 4 | 연출 범위 | **정적 디자인 우선**. 타이프라이터·지터(랜덤)는 `enableAnimation`/`enableJitter` 토글로 넣되 확정 대상 아님 |
| 5 | 근거 표시 | 기본 = **번호 박스 + 색상 매칭 사이드 리스트**. `evidenceMode`로 tooltip/caption도 전환 가능 |
| 6 | 대상 이미지 | 아래 **§3의 5장**(방향·해상도·의심도·색·시리즈 최대 다양성, 평온 상태 1장 포함) |
| 7 | 반환 방식 | **CONFIG 블록 미러링 + 파일 반환**. 디자인 값을 단일 CONFIG/CSS 변수에 모아 추후 React/Tailwind와 1:1 대응. 작가는 CONFIG 안에서만 고치고 파일을 돌려줌 → 값만 복사해 이식 |

---

## 2. 데이터 현실 (중요)

- `eval_results.xlsx` = 1시트(`평가결과`), 행당 1이미지, 핵심은 `특징JSON` 컬럼.
- `특징JSON` 구조: `image{width,height}` · `algo_score`·`gpt_score`·`final_score` · `features[35]`.
- 각 feature = 박스 1개: `title`(한글 특징명)·`key`·`x1,y1,x2,y2`(원본 픽셀)·`ensemble_score`·`score_pct`·`color`·`description`.
- **박스 35개 중 ~25개가 전체화면 영역**(`0,0→W,H`), 고유 사각형은 ~8개. 객체 탐지식 타이트 박스가 아니라 **전체/띠 영역 오버레이**. → 그래서 §1-2 큐레이션 필요.
- 색: `ensemble_score` 기준 빨강(≥0.75 `#F38BA8`)/노랑(≥0.50 `#F9E2AF`)/초록(<0.50 `#A6E3A1`). `null` 점수 박스 존재 → 렌더 스킵 또는 회색.
- 평가 자료 **정답 라벨은 전부 "실제"**. `최종점수≥50`(=오답)은 진짜 사진을 AI로 오인 → 작업의 개념적 핵심.

---

## 3. 대상 5장 (확정)

| # | id | 크기 (ar) | 방향 | 최종% | 판정 | 빨강/노랑/초록 | 선정 이유 |
|---|----|----|----|----|----|----|----|
| 1 | `S3_SS2_05` | 1006×330 (3.05) | 초광각 | 80 | 오답 | 12/23/0 | 최고 의심도·무초록 = 최대 경보, 극단 가로비 스케일 테스트 |
| 2 | `S1_SS1_01` | 2048×2048 (1.0) | 정사각 | 73 | 오답 | 7/13/15 | 컬렉션 첫 파일, 정사각, 균형 색 |
| 3 | `S2_SS2_04` | 1080×1350 (0.8) | 세로 | 67 | 오답 | 3/9/23 | 세로형, S2, 노랑 우세 |
| 4 | `S1_SS8_02` | 4032×3024 (1.33) | 대형 가로 | 8 | 정답 | 0/1/34 | **유일한 평온/초록/낮은% 상태**, 4K 스케일 |
| 5 | `S3_SS3_34` | 710×531 (1.34) | 소형 가로 | 61 | 오답 | 7/4/24 | 작은 원본(박스 가독성), S3 |

시리즈 S1×2 / S2×1 / S3×2. 5장 모두 `data/collection.json`(배포 198) + Cloudinary 업로드 확인됨.

---

## 4. 파일/레포 배치

```
handoff/ai-verdict-demo/
├─ index.html              # 단독 데모(작가+에이전트가 편집하는 본체)
├─ data.js                 # 5장의 특징JSON 추출본 (window.AI_DEMO_DATA = {...})
└─ README.md               # 작가+코딩 에이전트용 안내(데이터 형식·CONFIG 설명·반환 규칙)
scripts/
└─ extract-ai-demo-data.mjs  # eval_results.xlsx → handoff/ai-verdict-demo/data.js (5행만)
```

- `handoff/`는 `app/` 밖 → **Next 빌드/배포에 포함 안 됨**(라우트로 노출되지 않음). develop에 커밋(재현·공유용).
- 이미지: **Cloudinary 딜리버리 URL**(공개 도메인, 포터블). 좌표 계산은 `특징JSON`의 원본 `width/height` 사용, 표시 크기로 스케일. base64 임베드 안 함(4K 이미지로 파일 비대화 방지).
- 추출 스크립트는 1회 생성용. 핸드오프 후엔 작가가 `index.html`을 직접 편집(스크립트 재실행으로 덮어쓰지 않음).

---

## 5. 디자인 서페이스 (CONFIG) — 추후 React와 1:1

`index.html` 상단의 단일 `CONFIG` 객체 + `:root` CSS 변수. **여기서만 수정**.

```js
const CONFIG = {
  // ── 선별 ───────────────────────────────
  boxCount: 6,            // 노출 박스 수
  filter: 'signal',       // 'signal'(점수순 상위) | 'partial'(전체화면 제외) | 'all'
  showAll: false,         // true면 35개 전부(boxCount 무시)
  sortBy: 'score',        // 'score' | 'order'
  skipNullScore: true,    // ensemble_score null 박스 스킵(false면 회색)

  // ── 박스 모양 ──────────────────────────
  borderWidth: 2, borderStyle: 'solid', borderRadius: 0,
  cornerStyle: 'plain',   // 'plain' | 'brackets'(모서리 ⌐) | 'corners'
  fillOpacity: 0,         // 박스 내부 채움 투명도

  // ── 색 ────────────────────────────────
  colorScale: [           // ensemble_score 임계 → 색 (기본 = 데이터 색)
    { min: 0.75, color: '#F38BA8' },   // 빨강
    { min: 0.50, color: '#F9E2AF' },   // 노랑
    { min: 0,    color: '#A6E3A1' },   // 초록
  ],
  useDataColor: true,     // true면 데이터 color 우선, false면 colorScale 재계산

  // ── 라벨 ──────────────────────────────
  showNumber: true, showTitle: true, showPct: true,
  labelPosition: 'inside-tl',  // 'inside-tl' | 'outside' | 'none'

  // ── 근거 ──────────────────────────────
  evidenceMode: 'sidelist',    // 'sidelist'(기본) | 'tooltip' | 'caption'
  sidelistPosition: 'right',   // 'right' | 'below'

  // ── 종합 ──────────────────────────────
  showSummary: true,
  summaryTemplate: '{pct}% 정도 생성된 것으로 의심됩니다',
  summaryPosition: 'top',      // 'top' | 'bottom'

  // ── 연출(확정 대상 아님, 탐색용) ───────
  enableAnimation: false, typeSpeed: 24,
  enableJitter: false, jitterAmount: 4,
};
```

- 데이터/렌더 로직은 CONFIG 아래에 분리(에이전트가 디자인 면만 안전히 수정).
- 색 3종, evidence 3모드, 라벨 위치 등은 추후 `AiVerdictSlot`/`FileDetail`의 props·CSS 변수로 그대로 대응.

### 박스 렌더 스케일링
```
scaleX = 표시폭 / image.width ;  scaleY = 표시높이 / image.height
left = x1*scaleX ; top = y1*scaleY ; w = (x2-x1)*scaleX ; h = (y2-y1)*scaleY
```
컨테이너 `position:relative`, 박스 `position:absolute`. 반응형 위해 % 좌표로 변환 권장.

---

## 6. 작가 + 코딩 에이전트 안내 (README + 임베드 주석)

`README.md`와 `index.html` 상단 주석에 포함:
1. 이 파일의 목적(박스 디자인 확정) · 배포 웹과 분리됨.
2. 데이터 형식 요약(특징JSON·색 기준·null 주의).
3. **"CONFIG 블록 안에서만 수정하라"** + 각 knob 설명.
4. 반환 규칙: 수정한 `index.html`(+ 필요시 CSS 변수)을 그대로 돌려주면 값만 복사해 이식.
5. 새 디자인 아이디어는 CONFIG 밖 구조 변경보다 knob 추가 요청 권장(이식성 유지).

---

## 7. 단계별 작업

| Phase | 내용 |
|-------|------|
| A. 데이터 추출 | `scripts/extract-ai-demo-data.mjs` 작성 → 5장 행의 `특징JSON` + 점수 + Cloudinary publicId를 `data.js`로 출력 (SheetJS, Node) |
| B. 렌더 코어 | `index.html`: 5장 컨테이너, 스케일 박스 렌더, 색/라벨/사이드리스트 기본 구현 |
| C. CONFIG 면 | §5 CONFIG + CSS 변수 전부 배선(선별·모양·색·라벨·evidenceMode·summary) |
| D. 연출 토글 | `enableAnimation`(타이프라이터)·`enableJitter` 옵트인 구현(기본 off) |
| E. 안내·마감 | README + 임베드 주석, 5장 전 시각 점검(초광각·4K·소형 스케일 확인), `handoff/` 커밋 |

---

## 8. 범위 밖 / 추후

- ❌ 배포 웹(`app/`, `AiVerdictSlot`) 변경 — **이번 작업 아님**. 확정 후 별도 이식 작업.
- ❌ 200장 전체 적용 — 데모는 5장. 확정 디자인을 데이터 일반화는 이식 단계에서.
- ⏭ 타이프라이터·지터의 정밀 타이밍/안무 — 별도 연출 패스.
- ⏭ 평가항목 한글 특징명을 더 구어적으로 매핑할지(예: "FFT 주파수 분포" → "화질") — 필요 시 CONFIG에 라벨 override 맵 추가.

---

## 9. 내가 기본값으로 정한 것 (이의 시 조정)

- 배치: `handoff/ai-verdict-demo/`(비배포) + `scripts/extract-ai-demo-data.mjs`
- 이미지: Cloudinary 딜리버리 URL(포터블), 좌표는 원본 px 기준 스케일
- 기본 `boxCount: 6`, `filter: 'signal'`, `evidenceMode: 'sidelist'`, 연출 off
- 색 기본 = 데이터 3색(빨강/노랑/초록), CONFIG로 override 가능
- 커밋: develop 브랜치, `feat:` 컨벤션
