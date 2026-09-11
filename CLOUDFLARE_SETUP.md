# Cloudflare Pages 자동배포 설정

이 저장소는 **Cloudflare의 GitHub App 연동을 사용하지 않습니다.**
대신 GitHub Actions가 `main` 브랜치에 푸시될 때 Cloudflare Pages로 자동 배포합니다.

워크플로: `.github/workflows/cloudflare-pages.yml`
프로젝트명: `ssulpan`
배포 폴더: `dist`

## 1. Cloudflare API Token 만들기

Cloudflare Dashboard → 프로필/계정 → API Tokens → Create Token → Create Custom Token.

권한:
- Account → Cloudflare Pages → Edit

리소스:
- 현재 사용하는 Cloudflare 계정만 선택

토큰 이름 예시: `ssulpan-github-actions`

토큰 값은 생성 직후 한 번만 보이므로 복사해 둡니다. 저장소 파일이나 채팅에 붙여 넣지 않습니다.

## 2. Cloudflare Account ID 확인

Cloudflare Dashboard에서 현재 계정의 Account ID를 확인합니다. Dashboard URL의 계정 식별자 또는 계정 Overview/Workers & Pages의 Account ID를 사용할 수 있습니다.

## 3. GitHub Secrets 2개 등록

GitHub → `NAM5AN/ssulpan` → Settings → Secrets and variables → Actions → New repository secret.

다음 두 개를 만듭니다.

- `CLOUDFLARE_API_TOKEN` = 위에서 만든 Cloudflare API Token
- `CLOUDFLARE_ACCOUNT_ID` = Cloudflare Account ID

`GITHUB_TOKEN`은 GitHub Actions가 자동으로 제공하므로 직접 만들 필요 없습니다.

## 4. 자동배포

Secrets 등록 후 GitHub의 Actions 탭에서 `Deploy ssulpan to Cloudflare Pages`를 한 번 `Run workflow` 하거나 `main`에 새 커밋을 푸시합니다.

워크플로가:
1. 공개 사이트에 필요한 파일만 `dist/`에 복사
2. `ssulpan` Pages 프로젝트가 없으면 생성 시도
3. `dist/`를 Cloudflare Pages에 배포

합니다.

이후에는 `main`에 커밋될 때마다 자동 배포됩니다.

## 5. 커스텀 도메인

첫 배포 성공 후 Cloudflare → Workers & Pages → `ssulpan` → Custom domains에서 도메인을 추가합니다.

DNS를 Cloudflare에서 관리하면 HTTPS 인증서도 Cloudflare가 처리합니다.

## 백엔드

프론트는 Vercel을 사용하지 않습니다.

- 공개 글/조회수: Supabase Edge Function `ssul_public`
- 제작실 저장/게시/이미지: `ssul_admin`
- Claude/GPT: `ssul_generate`
- DB/Storage: 기존 `cheheomdan` Supabase 프로젝트의 `ssul_*`

브라우저에는 Supabase URL과 publishable key만 포함됩니다. `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, service-role/secret key는 Supabase 서버 함수에만 있습니다.
