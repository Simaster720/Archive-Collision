# 배포 가이드 (Vercel + develop→main 자동 병합)

근거: [ADR 0001](./adr/0001-vercel-hobby-pat-merge-deploy.md). 흐름:

```
feature/* → PR → develop  ──(push)──▶  GitHub Action(release.yml)
                                         └ 오너 PAT로 develop→main --no-ff 병합 push
                                              └ main = Vercel 프로덕션 브랜치 → 자동 배포
```

코드(워크플로 `release.yml`)는 레포에 포함돼 있다. 아래 **수동 설정은 1회만** 하면 된다(오너 계정/대시보드 권한 필요).

---

## 1. Vercel 연결 (1회)

1. Vercel 대시보드 → **Add New… → Project** → 이 GitHub 레포 Import.
2. Framework Preset: **Next.js** (자동 감지). Build/Install 기본값 그대로.
   - `npm run build`가 `prebuild`(= `node scripts/build-data.mjs`)를 자동 실행해 엑셀→JSON을 갱신한다. 별도 설정 불필요.
3. **Settings → Git → Production Branch = `main`** 으로 설정.
4. **Settings → Environment Variables** 에 아래 추가(Production·Preview 모두):

   | Key | Value | 비고 |
   |-----|-------|------|
   | `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | `dey2my9dg` | **필수.** 없으면 이미지 URL의 cloud_name이 비어 썸네일/상세가 깨짐 |

   - `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET`는 **업로드 스크립트 전용**이라 Vercel에 넣지 않는다(런타임 미사용). 추후 서버에서 업로드/서명이 필요해질 때만 추가.

> 비밀값은 절대 커밋 금지(`.env*`는 `.gitignore`에 포함됨). cloud_name은 공개 값이라 안전.

---

## 2. GitHub Secret: `OWNER_PAT` (1회)

`release.yml`이 오너 명의로 main에 push하려면 **오너의 PAT**가 필요하다.

1. 오너 계정으로 PAT 발급
   - Classic: scope `repo`.
   - Fine-grained: 이 레포에 **Contents: Read and write** + (브랜치 보호 우회를 위해) 아래 3번의 bypass 대상에 포함.
2. 레포 **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `OWNER_PAT`, Value: 발급한 토큰.
3. 만료일을 캘린더에 기록(만료 시 자동 배포가 끊김 — ADR 0001 주의사항).

---

## 3. main 브랜치 보호 + PAT bypass (1회)

main에는 액션(오너 PAT) 외 직접 push를 막되, 오너 PAT의 push는 허용해야 한다.

- **Settings → Rules → Rulesets**(권장) 또는 **Branches → Branch protection rules** 에서 `main` 대상 규칙 생성:
  - 직접 push 제한(필요 시 PR 요구 등).
  - **Bypass list**에 **오너(또는 오너 PAT)** 추가 → 액션의 push가 통과.
- develop엔 보호 규칙을 두지 않거나, "PR 머지로만 진입"하는 리뷰 게이트를 둔다(프로덕션 게이트는 develop 진입 PR에 존재).

---

## 4. 협업 플로

```
git checkout -b feature/xxx     # 기능 작업
# … 커밋 …
PR: feature/xxx → develop       # 리뷰 게이트(여기서 검토)
develop 머지/푸시               # → release.yml 자동 실행 → main 병합 → Vercel 프로덕션 배포
```

엑셀/이미지 갱신도 동일: `data/source/*.xlsx` 교체(또는 `npm run upload`로 이미지 추가) → 커밋 → develop push → 자동 반영.

---

## 5. E2E 검증 체크리스트

1. develop에 사소한 커밋 push.
2. **Actions** 탭에서 `Release (develop → main)` 성공 확인.
3. main에 `release: merge develop into main` 병합 커밋이 **오너 명의**로 생성됐는지 확인.
4. **Vercel**에서 프로덕션 배포가 자동 생성·성공했는지 확인.
5. 배포 URL에서: 사이드바 트리 / 그리드 썸네일(Cloudinary) / 상세(이미지·메타·자료내용) / HEIC 파일(`/S3/SS3/S3_SS3_07`)이 정상 표시되는지 확인.

---

## 참고: 로컬 명령

| 명령 | 설명 |
|------|------|
| `npm run dev` | 로컬 개발 서버 |
| `npm run data` | 엑셀 → `data/collection.json` 재생성 |
| `npm run build` | 프로덕션 빌드(prebuild에서 data 자동 생성) |
| `npm run upload -- --dry-run` | 이미지 업로드 매핑 미리보기 |
| `npm run upload` | 로컬 이미지 → Cloudinary 일괄 업로드(`.env.local` 필요) |
