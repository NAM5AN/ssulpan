# Cloudflare Pages 배포 설정

이 저장소는 **빌드가 필요 없는 정적 사이트**이며, 데이터/AI/이미지는 기존 체험단매니저 Supabase의 `ssul_*` 리소스를 사용합니다.

## Pages 프로젝트 생성

Cloudflare Dashboard → Workers & Pages → Create application → Pages → Connect to Git.

- GitHub repository: `NAM5AN/ssulpan`
- Production branch: `main`
- Framework preset: `None`
- Root directory: 비워 둠 (repository root)
- Build command: `exit 0`
- Build output directory: `.`
- Environment variables: **없음**

배포 후 `*.pages.dev` 주소에서 먼저 확인합니다.

## 커스텀 도메인

Pages 프로젝트 → Custom domains → Set up a domain.

- 루트 도메인(apex, 예: `ssulpan.net`)을 쓸 경우 해당 도메인을 Cloudflare DNS zone으로 추가하고, 등록기관의 nameserver를 Cloudflare가 안내하는 2개 nameserver로 변경해야 합니다.
- `www.example.com` 같은 서브도메인만 쓸 경우 CNAME 방식도 가능합니다.
- 가장 간단한 방법은 도메인 DNS를 Cloudflare로 관리한 뒤 Pages의 Custom domains에서 루트 도메인과 `www`를 모두 추가하는 것입니다.

## 백엔드

브라우저에 노출되는 값은 Supabase URL + publishable key뿐이며, 비밀키는 포함하지 않습니다.

- 공개 글/조회수: `ssul_public`
- 제작실 저장/게시/이미지: `ssul_admin`
- Claude/GPT: `ssul_generate`
- DB/Storage: 기존 cheheomdan Supabase 프로젝트의 `ssul_*`

`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, service-role/secret key는 Supabase Edge Function에만 남습니다.
