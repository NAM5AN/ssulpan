# sseolzip restored runtime

이 디렉터리는 2026-09-11에 회수한 **실제 원본 3개(`worker/core.mjs`, `worker/index.mjs`, `public/studio.js`)**를 기준으로, 원본 ZIP에 없던 의존 파일을 역복원해 서로 연결한 실행 복구본입니다.

## 원본 그대로인 파일
- `worker/core.mjs`
- `worker/index.mjs`
- `public/studio.js`

위 세 파일은 `recovered/sseolzip/implementation-review/baseline/`에서 복사했으며 수정하지 않았습니다.

## 역복원한 파일
- `worker/render.mjs`: 남은 Worker 호출 규약, 사이트 projection 텍스트, 독서화면/제작실 스크린샷을 맞춰 복원
- `content.json`: 사이트 projection에 남은 6개 제목·소개·분류·태그와 보존 스크린샷/기존 재구성 데이터를 합쳐 호환 스키마로 복원
- `config.json`: `index.mjs`가 참조하는 광고/페이지 기본 설정을 현재 확인 가능한 동작으로 복원
- `public/studio/index.html`: 살아남은 `public/studio.js`가 요구하는 DOM ID와 당시 스크린샷을 기준으로 복원
- `public/cover.js`: `window.SseolzipCover.draw` 호출 규약 및 1080×1920 주황/청록 표지 스크린샷을 기준으로 복원
- `public/site.css`, `public/reader.js`, `public/public.js`, `public/404.html`
- `build.py` — `.sites-runtime/assets.json` 생성
- `db/schema.sql`: 살아남은 SQL 질의의 테이블/컬럼을 역추론하여 복원

이 파일들은 **원본 바이트 사본이라고 주장하지 않습니다.** 원본 사본은 상위 `recovered/sseolzip/implementation-review`와 `prompt-v2`에 별도 보존되어 있습니다.

## 확인
```bash
npm test
```

현재 복구 테스트는 **5/5 통과**합니다. 6개 초기 글, 홈 구조, 계속읽기 화면, 제작실 DOM 계약, 빌드 자산을 검사합니다.

## 아직 데이터 덤프 자체가 없는 것
- 당시 D1 실제 행 데이터(원고/버전/작업 기록/게시 데이터/설정)
- R2/BUCKET 실제 이미지 객체
- 실제 누적 조회수

이 세 가지는 코드만으로 원본 값을 생성할 수 없으므로, 원본 데이터가 발견되기 전에는 복구값을 임의 생성하지 않습니다.
