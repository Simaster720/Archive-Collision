# develop→main 병합을 오너 PAT GitHub Action으로 자동화하고 Vercel 네이티브 연동으로 배포한다

## 맥락

Vercel Hobby(무료) 플랜은 커밋 author가 Vercel 계정 오너가 아니면 Git 푸시에 대한 프로덕션 배포를 생성하지 않는다. 협업자들이 레포에 직접 푸시·병합하면 그 커밋은 배포되지 않는다. Hobby는 팀 멤버 추가도 불가능하다.

## 결정

- 협업자는 `feature/*` → PR → **`develop`**(리뷰 게이트)로 작업한다.
- `develop`에 push되면 GitHub Action이 **오너의 PAT**로 `develop`을 `main`에 병합한다. 병합 커밋의 author/푸셔가 오너가 되도록 git config와 토큰을 설정한다.
- `main`은 Vercel 네이티브 Git 연동에 연결되어 있어, 오너 명의 커밋이 들어오면 **프로덕션 자동 배포**된다.
- `main`은 브랜치 보호로 Action(오너 PAT) 외 직접 푸시를 막는다.

즉 배포 자체는 Vercel이 하고, GitHub Action의 역할은 "오너 명의 병합"을 자동화하는 것뿐이다. Action이 Vercel CLI로 배포하지 않는다.

## 고려한 대안

- **오너 수동 머지**: 오너가 develop→main PR을 직접 머지. 가장 단순하나 오너가 매번 개입해야 함 → 협업자 작업 반영이 지연됨.
- **Vercel Deploy Hook**: main push 시 Action이 Deploy Hook URL 호출로 배포. PAT 불필요하나 "오너 명의" 게이트가 사라지고 main에 올라온 것은 무조건 배포됨.
- **Pro 플랜 업그레이드**: 비용 발생. 초안 단계에 부적합.

## 결과

- `VERCEL_TOKEN`이 아니라 **오너의 GitHub PAT**를 GitHub Secret으로 보관한다. 이 토큰은 main 보호 규칙을 우회해 푸시할 권한이 필요하므로 권한 범위와 만료를 주의해 관리한다.
- 프로덕션 게이트는 `main`이 아니라 `develop` 진입 PR 리뷰에 존재한다. main은 배포 미러.
- PAT 만료/유출 시 자동 배포가 끊기므로 갱신 절차를 문서화해야 한다.
