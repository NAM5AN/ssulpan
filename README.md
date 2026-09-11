# 썰판 (ssulpan)

커뮤니티형 썰 콘텐츠 사이트 프로젝트입니다.

## 현재 복구 기준

ChatGPT Sites의 기존 `sseolzip` 프로젝트 화면/기능을 기준으로 GitHub 버전을 재구성하고 있습니다.

현재 확인된 기능:
- 홈 / 직장생활 / 인간관계 / 일상 / 인기글
- 추천글 배너 자동재생
- 검색
- 최신순 / 오래된순 / 조회수순 정렬
- 카드형 / 목록형 보기
- 조회수 / 인기글 / 태그
- 숨겨진 제작실 페이지
- 원고 생성·수정·저장·게시 흐름
- Claude 생성 결과에서 태그 자동 추출 규칙

## 실행

정적 파일이라 `index.html`을 바로 열 수 있고, Vercel에 그대로 배포할 수 있습니다.

제작실은 메인 UI에 링크를 노출하지 않고 `/studio.html`로 직접 접근합니다.

## AI 생성 API

Vercel 환경 변수에 아래 값을 설정합니다.

- `ANTHROPIC_API_KEY`
- `ANTHROPIC_MODEL` (선택)

`/api/generate`가 Claude 호출을 중계합니다. API 키는 브라우저에 노출하지 않습니다.

## 이전 사이트

- ChatGPT Sites slug: `sseolzip`
- GitHub repo: `NAM5AN/ssulpan`

> ChatGPT Sites 원본 소스 파일은 직접 export되지 않아, 보존된 사이트 내용과 제작실 화면을 기준으로 GitHub 버전을 복구합니다.
