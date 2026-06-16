# 핸드오프 — EXIF 방향 보정 (이미지 세로 짤림 + 박스 어긋남)

자료 상세 페이지에서 **세로 사진이 아래쪽이 잘려 보이고, AI 판별 박스가 엉뚱한 위치**에 찍히는
버그. 원인은 평가 파이프라인이 EXIF 회전을 무시하고 raw 버퍼 좌표를 기록한 것. 이 문서는
**다른 세션이 이슈를 파악하고 C안(빌드 타임 좌표 변환)을 끝까지 구현**하기 위한 작업계획서다.
조사·결정은 끝났고, 아래 그대로 실행하면 된다. (조사 세션: 2026-06-16, 브랜치 `develop`)

> **이 세션에서는 구현하지 않았다.** 코드 변경 0. 본 문서만 추가됨.

> **데이터 기준 (드리프트 방지):** 본 문서의 좌표·치수 예시는 `eval_results.xlsx`
> @ `develop 803309b` (sha256 `d81596…19a0`, 2026-06-16 수정본 반영) 기준이다. 구현 시작
> 전에 `S2_SS1_02`의 `image = 5712×4284`와 §6 worked-example 표의 박스 좌표가 **현재 파일과
> 일치하는지 1회 확인**하면 데이터 드리프트를 즉시 검출할 수 있다. (재스코어링 수정본으로
> 교체돼도 기하는 불변임을 2026-06-16 교체로 실증: 198 id 중 치수 변경 0, 좌표 변경 1px 1건
> `S3_SS3_07/halo`뿐 — §8.2 참고.)

---

## 0. 먼저 읽을 것 (진실 원천)

1. [components/AiVerdict.tsx](../components/AiVerdict.tsx) — 짤림이 발생하는 렌더 지점(컨테이너 `aspectRatio` + `overflow-hidden`)
2. [scripts/lib/ai-verdict.mjs](../scripts/lib/ai-verdict.mjs) — `featureJsonToVerdict` / `selectBoxes` (박스 선별·치수)
3. [scripts/lib/eval.mjs](../scripts/lib/eval.mjs) — `eval_results.xlsx` → `Map<id, AiVerdict>` (변환을 끼워 넣을 지점)
4. [scripts/build-data.mjs](../scripts/build-data.mjs) — 파이프라인(오프라인 경로로 재빌드)
5. [scripts/upload-cloudinary.mjs](../scripts/upload-cloudinary.mjs) — 원본 바이트를 Cloudinary에 업로드(EXIF 진실 원천 근거)
6. [CONTEXT.md](../CONTEXT.md) — 도메인 글로서리(트래킹 박스·AI 판별)
7. [docs/adr/0003](./adr/0003-tracking-box-jitter-client-side.md) — 박스 지터(표시 전용·데이터 미저장)

---

## 1. 증상 / 재현

- URL 예: `https://www.archivecollision.art/S2/SS1/S2_SS1_02`
- 세로로 찍은 사진의 **아래쪽 ~44%가 잘려** 보인다. 박스 오버레이도 특징과 어긋남.
- 폴백 경로([FileDetail.tsx:85-91](../components/FileDetail.tsx#L85-L91), `file.ai = null`인 자료)는
  `object-contain`이라 **안 잘린다**. 문제는 `file.ai`가 있는 본 경로(AiVerdict)에만 있다.

---

## 2. 근본 원인 (증거 체인)

`S2_SS1_02` 기준으로 추적한 사실:

| 단계 | 사실 | 증거 |
|------|------|------|
| 원본 | 실제로 **세로 사진**. 카메라가 가로 버퍼 `5712×4284` + "90° 회전" 플래그로 저장 | EXIF **Orientation = 6** |
| 평가 | `batch_eval.py`가 **EXIF 미적용**으로 `img.size`를 읽음 → raw 가로 치수·좌표를 기록 | [batch_eval.py:389](../data/source/batch_eval.py#L389) `Image.open().convert("RGB")`, [:391](../data/source/batch_eval.py#L391) `iw, ih = img.size` — `exif_transpose` 호출 **없음** |
| 데이터 | `eval_results.xlsx`의 `특징JSON.image = {width:5712, height:4284}`, 박스 좌표도 raw 가로 공간 | → [collection.json](../data/collection.json) `ai.imageWidth/Height = 5712/4284` |
| 전달 | Cloudinary는 **원본 바이트**를 업로드받아 EXIF를 자동 적용 → **세로로 서빙** | `c_limit,w_1600/...S2_SS1_02` = **1600×2133** (비율 0.75) / [upload-cloudinary.mjs:76](../scripts/upload-cloudinary.mjs#L76) |
| 렌더 | 컨테이너 `aspectRatio: 5712/4284`(가로·납작) + `overflow-hidden` 인데 실제 `<img>`는 세로라 프레임보다 김 → 아래가 잘림 | [AiVerdict.tsx:145-162](../components/AiVerdict.tsx#L145-L162) |

**한 줄 요약:** 메타데이터·박스는 *raw 가로 공간*, Cloudinary가 서빙하는 이미지는 *EXIF 적용 세로 공간*.
두 좌표계가 어긋나서 (1) 프레임 비율 불일치 → 세로 짤림, (2) 박스 좌표계 불일치 → 박스 어긋남.

> 핵심 정합성 근거: Cloudinary가 적용한 방향 = **업로드된 원본의 EXIF**이고, 업로드 원본은
> `drive-download-*` 폴더([upload-cloudinary.mjs:53-62](../scripts/upload-cloudinary.mjs#L53-L62)).
> 따라서 **드라이브 원본에서 읽은 EXIF로 변환하면 Cloudinary 출력과 정확히 일치**한다.

---

## 3. 범위

`drive-download-*`의 JPG 151장 EXIF Orientation 분포:

| Orientation | 의미 | 장수 | 짤림 | 박스 어긋남 |
|---|---|---|---|---|
| 1 | 정상 | 23 | — | — (변환 불필요) |
| 3 | 180° | 2 | 없음(비율 동일) | **있음**(180° 뒤집힘) |
| 4 | 상하 거울 | 1 | 없음(비율 동일) | **있음** |
| 5 | 전치(transpose) | 1 | **있음**(비율 스왑) | **있음** |
| 6 | 90° CW | 124 | **있음** | **있음** |

- **짤림 영향: 125장** (5·6), **박스 어긋남 영향: 128장** (3·4·5·6). 정상(1)은 23장.
- 따라서 orientation 6만 처리하면 안 되고 **표준 8케이스 전체**를 구현해야 한다(아래 §5.1).
- HEIC 등 비-JPG(예: `S1_SS14_*`)는 eval 없음 → `ai: null` → 카드 미렌더 → 영향 없음.
  변환 맵에 없으면 **기본 orientation = 1(변환 없음)** 으로 안전 처리.

---

## 4. 결정: C안 (빌드 타임 좌표 변환) — A안 아님

- **C안**: `eval_results.xlsx`는 그대로 두고, 빌드 때 EXIF에 따라 **치수·박스 좌표만 회전 보정**.
  여기서 끝낼 수 있고, GPT 재호출·비용·텍스트 변동 0. 박스 위치는 회전이 무손실이라 **정확**.
- **A안(평가 재실행)은 채택 안 함**: `batch_eval.py`에 `exif_transpose` 추가 후 전체 재평가가
  "정석"이지만 — `backend/` 패키지가 이 저장소에 없고, GPT-4o 비용이 들며, 판정문이
  비결정적으로 **재생성**되어 기존 큐레이션이 갈린다. 검출 품질의 *상한*은 A가 높으나, 박스에
  지터가 들어가는 **연출용 기능**(ADR 0003)에선 한계 이득. → 신고 버그(기하)는 C로 충분.
  (A를 추후 품질 개선으로 별도 진행하려면 §2의 `exif_transpose` 한 줄이 진입점.)

> **프론트엔드는 안 건드린다.** [AiVerdict.tsx](../components/AiVerdict.tsx)는 한 줄도 안 바뀜.
> collection.json에 *세로* 치수·좌표가 들어가면 기존 렌더 코드가 그대로 정확해진다.

---

## 5. 작업 계획 (구현)

### 5.1 EXIF 변환 테이블 (표준 8케이스)

저장(raw) 좌표 `(x, y)`, raw 치수 `(W, H)` → 표시 좌표 `(x', y')`, 표시 치수 `(W', H')`:

| Orientation | (x', y') | (W', H') |
|---|---|---|
| 1 | (x, y) | (W, H) |
| 2 | (W−x, y) | (W, H) |
| 3 | (W−x, H−y) | (W, H) |
| 4 | (x, H−y) | (W, H) |
| 5 | (y, x) | (H, W) |
| 6 | (H−y, x) | (H, W) |
| 7 | (H−y, W−x) | (H, W) |
| 8 | (y, W−x) | (H, W) |

**박스 변환:** 두 모서리 `(x1,y1)`·`(x2,y2)`를 각각 변환한 뒤
`x1'=min, x2'=max, y1'=min, y2'=max`로 정규화(부호 뒤집힘 대비). 좌표는 정수 px 유지.

### 5.2 신규/수정 파일

| 종류 | 파일 | 내용 | 분량 |
|---|---|---|---|
| 신규 | `scripts/lib/exif-orient.mjs` | 위 8케이스 순수함수 2개: `transformBox(box,W,H,o)` / `applyOrientation(featureJson, o)`(image 치수 스왑 + 모든 features 좌표 변환, **immutable**) | ~50줄 |
| 신규 | `scripts/gen-orientation.mjs` | `drive-download-*`의 각 이미지 EXIF Orientation을 읽어 `data/source/orientation.json` 생성(1회 실행). EXIF 파서는 의존성 추가 없이 직접 구현 가능(JPEG APP1 헤더 파싱 ~25줄) | ~60줄 |
| 신규(생성물) | `data/source/orientation.json` | `{ "<id>": <orientation:int> }` 매핑. **커밋한다**(CI엔 drive-download 없음). 키는 확장자 제거한 `id`(예: `"S2_SS1_02": 6`) | ~151줄 |
| 수정 | `scripts/lib/eval.mjs` | orientation.json 로드 후, 루프에서 `featureJsonToVerdict` **호출 전에** `applyOrientation(feat, map.get(id) ?? 1)` 적용 | ~10줄 |

> EXIF 파서를 직접 짜기 싫으면 devDependency로 `exifr` 등을 `gen-orientation.mjs`에서만 사용 가능
> (런타임 아님). 단 결과 `orientation.json`은 커밋되므로 **빌드/런타임엔 추가 의존성 0**이 원칙.

### 5.3 삽입 지점 — `selectBoxes` **이전**이어야 한다 (정합성 핵심)

변환은 [eval.mjs](../scripts/lib/eval.mjs)의 행 루프에서 `featureJsonToVerdict(feat, …)` **호출 직전**에
`feat`에 적용한다. 그래야 [ai-verdict.mjs](../scripts/lib/ai-verdict.mjs)의 `selectBoxes`가 **표시 공간 좌표**로
선별을 수행한다. `featureJsonToVerdict`·`selectBoxes`·`CONFIG`는 **수정하지 않는다**.

**왜 선별 이전인가 (실제 데이터로):** `S2_SS1_02`의 `FG/BG` 박스는 raw에서 `(0,0)-(5712,856)` =
**전폭 가로 띠**(wr≥0.9). 변환 후엔 `(3428,0)-(4284,5712)` = **전고 세로 띠**(hr≥0.9). 페널티가
가로(`wr>0.82`, 0.45)·세로(`hr>0.82`, 0.35)로 **비대칭**이라([ai-verdict.mjs:132-133](../scripts/lib/ai-verdict.mjs#L132-L133)),
또 전폭 캡(`maxEdgeWideBoxes`)·`isWide` 판정이 방향에 의존하므로, 변환을 선별 *후*에 하면 raw
방향 기준으로 박스가 골라진다. 변환을 **선별 전**에 넣어야 "표시 화면에서 전폭/전고 박스를 억제"
하는 의도와 일치한다.

### 5.4 정합성 함정 체크리스트

- [ ] **CI**: `drive-download`는 CI/Vercel에 없다. EXIF를 런타임에 읽지 말고 **커밋된 orientation.json**을 읽을 것.
- [ ] **선별 이전 변환** (§5.3).
- [ ] **키 일치**: orientation.json 키 = `eval.mjs`의 `idFromFileName`(확장자 제거)과 동일해야 함.
- [ ] **기본값 1**: 맵에 없는 id는 orientation 1(변환 없음)로 안전 처리 + warn.
- [ ] **EXIF 진실 원천**: 반드시 **업로드된 그 원본**(`drive-download-*`)에서 읽기. 재인코딩/스트립된 사본 금지.
- [ ] **immutable**: features/image 복사본 반환(전역 코딩스타일 — 원본 객체 변형 금지).
- [ ] **방향값 6 vs 8 구분**: 치수만으론 구분 불가(둘 다 세로). 반드시 **실제 EXIF 태그**를 읽을 것.

---

## 6. 검증 / DoD

**재빌드(네트워크 불필요, 오프라인 경로):**
```bash
node scripts/gen-orientation.mjs          # 1회: orientation.json 생성
node scripts/build-data.mjs               # collection.json 재생성 (GOOGLE_SHEETS 키 불필요)
npm run build                             # 정적 빌드 그린 확인
```

**완료 조건(DoD):**
- [ ] `S2_SS1_02`의 `ai.imageWidth/Height`가 **4284 / 5712**(세로)로 바뀜.
- [ ] 모든 박스가 `0 ≤ 좌표 ≤ W'/H'` (빌드 시 assert 권장 — 좌표계 불일치를 즉시 검출).
- [ ] `S2_SS1_02` 페이지 렌더: **세로 짤림 사라짐** + 박스가 화면 속 해당 특징 위에 정확히.
- [ ] orientation 1(예: 어떤 정상 가로 자료) 페이지는 **변화 없음**(회귀 없음).
- [ ] orientation 3/4 자료(박스만 어긋났던 케이스)도 박스 위치 교정 확인.
- [ ] `npm run build` 그린.

**변환 검증용 worked example (`S2_SS1_02`, orientation 6 = `(x,y)→(H−y, x)`, dims `5712×4284 → 4284×5712`):**

| 박스 | raw `(x1,y1)-(x2,y2)` | 변환 후 기대값 |
|---|---|---|
| FG/BG | (0,0)-(5712,856) | **(3428,0)-(4284,5712)** |
| DEPTH | (1428,1071)-(4284,3213) | **(1071,1428)-(3213,4284)** |
| HALO | (0,2590)-(46,3142) | (1142,0)-(1694,46) |
| MICRO TEX | (3468,0)-(5052,4284) | (0,3468)-(4284,5052) |

구현한 `transformBox`가 위 첫 두 줄을 재현하면 변환 로직은 정확하다.

---

## 7. 롤백

- 가역적. `eval.mjs`의 변환 호출 1줄 제거 → 재빌드하면 원상 복구.
- 신규 파일 3개(`exif-orient.mjs`·`gen-orientation.mjs`·`orientation.json`)는 독립적이라 남겨도 무해.
- 커밋은 repo 컨벤션대로 `develop`에 단계 커밋(예: `fix: EXIF 방향 보정 — 세로 짤림·박스 좌표 교정`).

---

## 8. 열린 질문 (구현자 판단)

1. **근거 텍스트의 방향 표현**: 일부 `description`이 "좌측/상단" 같은 절대 위치를 언급하면 박스만
   회전돼 텍스트와 어긋날 수 있음. 샘플 점검 후, 흔하면 별도 처리(드물면 무시). 코스메틱.
2. **orientation.json 갱신 운영**: 새 자료 업로드 시 `gen-orientation.mjs` 재실행 필요. README/배포
   문서에 1줄 추가할지 결정.
   - **재스코어링 ↔ orientation.json:** 평가 수정본(점수 보정)은 **기하(치수·박스 좌표)를 바꾸지
     않으므로** `orientation.json` 재생성이 **불필요**하다. 재생성이 필요한 경우는 **신규 자료
     추가·이미지 교체** 등 기하가 바뀌는 변경뿐. (2026-06-16 `eval_results.xlsx` 수정본 교체로
     실증: 공통 198 id 중 이미지 치수 변경 0건.)
3. **assert 강도**: 범위 위반 시 build-fail로 막을지(권장) warn-skip할지. 데이터 신뢰도 정책에 맞춰.
