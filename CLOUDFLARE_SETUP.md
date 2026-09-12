# Cloudflare Pages 자동배포 설정

이 저장소는 **Cloudflare의 GitHub App 연동을 사용하지 않습니다.**
대신 GitHub Actions가 `main` 브랜치에 푸시될 때 Cloudflare Pages로 자동 배포합니다.

워크플로: `.github/workflows/cloudflare-pages.yml`
프로젝트명: `ssulpan`
배포 폴더: `dist`

## 네가 입력할 것은 1개뿐

GitHub → `NAM5AN/ssulpan` → Settings → Secrets and variables → Actions → New repository secret.

이 Secret 하나만 만듭니다.

- 이름: `CLOUDFLARE_API_TOKEN`
- 값: Cloudflare에서 발급한 API Token

`CLOUDFLARE_ACCOUNT_ID`는 **입력하지 않습니다.** 워크플로가 Cloudflare API에서 토큰이 접근할 수 있는 계정을 자동으로 찾아 설정합니다.

## Cloudflare API Token 권한

Cloudflare Dashboard → API Tokens → Create Token → Create Custom Token.

권한은 아래 2개:
- Account → Cloudflare Pages → Edit
- Account → Account Settings → Read

Account Resources는 **현재 사용할 Cloudflare 계정 1개만** 선택합니다. 여러 계정을 허용하면 자동 계정 선택이 모호해져 배포가 중단되도록 해두었습니다.

토큰 이름 예시: `ssulpan-github-actions`

토큰 값은 생성 직후 한 번만 보이므로 GitHub Secret에 바로 넣습니다. 저장소 파일이나 채팅에는 넣지 않습니다.

## 자동배포

Secret 등록 후 `main`에 커밋이 생기면 자동으로:
1. Cloudflare Account ID 자동 탐색
2. 공개 사이트 파일만 `dist/`에 복사
3. `ssulpan` Pages 프로젝트가 없으면 생성 시도
4. `dist/`를 Cloudflare Pages에 배포

합니다.

최초 Secret 등록 자체는 GitHub Actions 실행 이벤트가 아니므로, Secret을 넣은 뒤 한 번만 `넣음`이라고 알려주면 제가 `main`에 배포 트리거 커밋을 넣어 첫 배포를 시작할 수 있습니다. 이후부터는 코드 수정 커밋마다 자동 배포됩니다.

## 커스텀 도메인

첫 배포 성공 후 Cloudflare → Workers & Pages → `ssulpan` → Custom domains에서 도메인을 추가합니다.

DNS를 Cloudflare에서 관리하면 HTTPS 인증서도 Cloudflare가 처리합니다.

## 백엔드

프론트는 Vercel을 사용하지 않습니다.

- 공개 글/조회수: Supabase Edge Function `ssul_public`
- 제작실 저장/게시/이미지/Claude: `ssul_studio`
- DB/Storage: 기존 `cheheomdan` Supabase 프로젝트의 `ssul_*`

브라우저에는 Supabase URL과 publishable key만 포함됩니다. `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, service-role/secret key는 Supabase 서버 함수에만 있습니다.

<!-- Initial Cloudflare Pages deployment trigger -->


## 제작실 공개 방식

- 진입 주소: `/studio/`
- 로그인, 쿠키 인증, 비밀 접근 주소가 없습니다.
- 제작실 원고, 작성 지침, 작업 기록은 방문자 모두가 같은 공용 공간을 사용합니다.
- 주소를 아는 사람은 원고 수정, 게시, 이미지 업로드와 Claude 호출을 할 수 있습니다.
- 서비스 역할 키와 Claude API 키는 Supabase Edge Function 안에서만 사용하며 브라우저로 보내지 않습니다.
