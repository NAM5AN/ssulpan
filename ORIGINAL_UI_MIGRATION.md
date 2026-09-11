# 원본 UI 적용 기록

## 출처와 적용 방식

공개 전환된 기존 `sseolzip.tnwjd2854.chatgpt.site`에서 2026-09-11에 받은 실제 응답을 `recovered/sseolzip/live-ui-snapshot/`에 보존했습니다. `capture-manifest.json`은 각 응답의 URL, HTTP 상태, SHA-256을 기록합니다.

`style.css`, `community.css`, `community.js`, `reader.js`, `cover.js`, `thumbnails.js`, 로고, 파비콘, 배너 사진 3개는 원본 바이트 그대로 배포합니다. 총 11개 자산의 해시를 매 빌드와 배포 후 검사합니다. 기존 재구성 메인의 `app.js`, `post.js`, `post.html`은 새 공개 화면에서 사용하지 않습니다. 기존 `styles.css`는 아직 원본 HTML이 없는 별도 관리자 도구에서만 사용합니다.

`scripts/build-original.py`는 원본 HTML의 정확한 구간에서 목록·카드·배너·상세·페이지 껍데기를 추출합니다. 색상이나 여백을 다시 작성하지 않습니다. 이전 호스트가 주입한 Cloudflare challenge 코드만 제외하고, 글 제목/본문/조회수/링크 등 데이터 자리를 `ssul-render.mjs`가 채웁니다.

## URL과 백엔드

Cloudflare Pages의 `_worker.js`가 원래 `/stories/001/` 등 상세 주소와 `category`, `q`, `tag`, `order`, `view` 검색 조건을 처리합니다. 원본 reader.js의 `/api/stories/:id/view`도 기존 Supabase `ssul_public`에 연결합니다. 공개 UI는 원래 코드이고, 이식용 서버 어댑터만 새 코드입니다.

Supabase 관리자키·Claude/GPT 비밀키는 이 배포에 포함하지 않습니다. 기존 체험단매니저의 다른 리소스는 변경하지 않습니다.

## 원문 데이터

기존 6개 공개 상세 페이지에서 광고 전·후 전체 본문을 실제로 회수했습니다. 현재 DB의 6개 글은 이전에 작성된 짧은 재구성 샘플입니다. 이번 세션의 SQL 쓰기는 read-only transaction으로 거절되어 DB 본문 자체는 덮어쓰지 않았습니다.

어댑터는 DB 글이 이전 샘플의 제목·앞본문·뒷본문·끊기 문구와 모두 정확히 일치할 때만 회수한 원문으로 보완합니다. 사용자가 수정한 글은 덮어쓰지 않습니다. 조회수는 계속 Supabase의 실제 값을 씁니다. 제작실의 공개 글 읽기도 같은 `/api/ssul_posts`를 사용하므로 원문을 불러온 뒤 기존 인증된 저장 기능으로 편집할 수 있습니다.

## 검증 범위와 남은 부분

- 로컬 Node 테스트 6/6 통과: 자산 해시, 원본 UI 템플릿, 필터/정렬/카드, 6개 상세 및 계속읽기, HTML escaping, 새 편집 보호.
- 같은 데이터·브라우저로 원본과 새 화면을 오프라인 렌더링하여 비교: 393px 모바일 첫 화면의 픽셀 차이 없음. 1440px에서 레이아웃 일치; 태그 데이터 순서 구역의 픽셀 차이는 남음.
- 원본 캐러셀, 6개 카드 캔버스, 6개 상세의 계속읽기 클릭을 실행해 확인.
- 배포 워크플로가 실제 공개 URL에서 11개 자산 해시, 6개 상세, 3개 검색 조건, 원문 API를 별도로 검사합니다. 해당 실행 로그가 실제 배포 성공 증거입니다.

기존 `/studio/`는 공개 전환 후에도 HTTP 403입니다. 따라서 **원본 제작실 HTML까지 이전 완료한 것은 아닙니다.** 현재 인증된 별도 제작실을 유지합니다. 기존 공개 UI 원본과 구분합니다.

```sh
python3 scripts/build-original.py
node --test tests/original-ui.test.mjs
```
