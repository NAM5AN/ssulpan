# 썰판 원본 사본 이전 기록 — 2026-09-11

## 현재 상태

**원본 파일 22개를 변경 없이 GitHub에 보존했습니다. 전체 사이트 이식·실행 복구 완료가 아닙니다.**

이번 작업은 새로 작성한 샘플로 누락분을 채우지 않고, 사용자 Library에서 회수한 실제 ZIP의 파일을 옮기는 작업입니다. 기존 ChatGPT Sites에는 변경을 가하지 않았습니다. 저장소 루트의 `index.html`, `app.js`, `studio.html`, `studio.js`, `styles.css`, `api/generate.js`, `vercel.json`도 변경하지 않았습니다. 이 루트 파일들은 이전에 만든 재구성본이며 원본 사본과 구분해야 합니다.

## 확보하여 그대로 옮긴 파일

| 경로 | 확보 범위 |
|---|---|
| `implementation-review/baseline/public/studio.js` | 실제 제작실 클라이언트: 자동 저장, 서버 원고 선택, 결과 확인·반영, 이력, 이미지/URL 소재, 미리보기, 인스타 문구 및 PNG 저장 호출 |
| `implementation-review/baseline/worker/core.mjs` | 기존 입력 정리, 작업별 프롬프트·도구 스키마, 결과 검사 |
| `implementation-review/baseline/worker/index.mjs` | 기존 서버 요청 처리: 원고/이력/게시/작업/이미지/설정 저장, Claude 연결, 이어읽기 경로와 미리보기 라우팅 |
| `implementation-review/src/`, `patches/`, `tests/` | 당시 아직 운영 사이트에 적용하지 않았던 수정 패치, 보정·검사 모듈, 테스트 원본 |
| `implementation-review/`의 나머지 파일 | 당시 검토문, 입력 출처 목록, 실행 예제, 과거 테스트 결과 |
| `prompt-v2/` | 해당 검토의 입력과 해시가 일치하는 마스터 프롬프트, 생성/부분 수정/인스타 결과 스키마 3개, 변경요약 및 서버 반영 문서 |

`implementation-review`는 16개, `prompt-v2`는 6개입니다. 원본 파일명·내용·개행을 보존했습니다. prompt ZIP에서 잘못 표시된 한글 파일명 인코딩만 원래 UTF-8 이름으로 해석했습니다. 내용 바이트는 바꾸지 않았습니다. 원본에 남아 있는 `썰집` 명칭, 모델 ID, 과거 경로와 미완료 사항도 임의로 수정하지 않았습니다.

## 출처와 버전

- `ssuljib_implementation_review.zip` — 2026-09-10 06:35:50 UTC에 저장된 56,245바이트 파일.
- `ssuljib_master_prompt(2).zip` — 2026-09-10 06:18:34 UTC에 저장된 14,651바이트 파일.
- 검토 ZIP의 `input-manifest.json`에 기록된 기준 커밋은 `a5a8d9a1acc6047cefa38b53952e00dfb1d20d53`입니다. 이는 원래 작업공간의 기준이며 현재 GitHub 저장소의 커밋으로 가져온 것은 아닙니다.
- 이 사본과 현재 Sites 소스 버전 21이 완전히 같다는 증거는 확보하지 못했습니다. 라이브 사이트 직접 접속은 이번 환경에서 실패했고, Library의 사이트 자료는 렌더링된 화면 텍스트만 반환했습니다. 사이트 자체가 사라졌다는 뜻은 아닙니다.
- 이전에 “원본 코드를 확보할 수 없다”고 한 설명은 너무 넓었습니다. **기존 도구로 Sites 전체 소스 내보내기는 되지 않았지만, 별도 저장된 ZIP에 원본 일부가 남아 있었습니다.**

## 역복원 실행본

`restored-runtime/`에는 위에서 확보한 실제 원본 `worker/core.mjs`, `worker/index.mjs`, `public/studio.js`를 그대로 재사용하고, 원본 ZIP에 없던 의존 파일을 남아 있는 호출 규약·SQL 질의·사이트 projection·당시 스크린샷을 근거로 역복원한 실행 호환본을 추가했습니다.

복원 범위:
- `worker/render.mjs`: 목록 / 상세 / 계속 읽기 / 다음 글 / 제작실 링크
- `content.json`: 확인 가능한 6개 글의 호환 데이터
- `config.json`: 현재 확인 가능한 사이트 기본 동작
- `public/studio/index.html`: 원본 `studio.js`가 요구하는 DOM 계약
- `public/cover.js`: `window.SseolzipCover.draw` 호환 1080×1920 표지 렌더러
- `public/site.css`, `reader.js`, `public.js`, `404.html`
- `db/schema.sql`: 살아남은 SQL을 근거로 역추론한 D1 테이블
- `build.py`: 누락된 `.sites-runtime/assets.json`을 생성
- `tests/recovery.test.mjs`: 홈 / 6개 글 / 계속읽기 / 제작실 / 자산 검증

로컬 검증은 `npm test` 기준 **5/5 통과**했습니다. 이 디렉터리의 역복원 파일은 원본 바이트와 동일하다고 주장하지 않으며, 실제 원본과 구분하기 위해 별도 경로에 둡니다.

## 아직 실제 값 자체를 복구할 수 없는 데이터

| 누락 | 현재 처리 |
|---|---|
| 당시 D1 실제 행 데이터 | 스키마와 런타임 계약은 복원했지만 원고 버전·작업 기록·설정의 역사적 행 값은 없음 |
| R2/BUCKET 실제 이미지 객체 | 이미지 API와 소유권/메타데이터 계약은 원본 코드에 남아 있으나 객체 파일 자체는 없음 |
| 실제 누적 조회수 | 사이트 projection에서 당시 표시된 값 외에 서버의 역사적 카운터 덤프가 없음 |

이 세 가지는 원본 값이 존재하지 않는 상태에서 임의 생성하면 복구가 아니라 조작이 되므로, 별도 원본 덤프가 발견되기 전에는 복구 완료로 표시하지 않습니다.

## 왜 기존 루트를 바로 덮어쓰지 않았는가

원본 서버는 `env.DB`, `env.BUCKET`, `ctx.waitUntil` 등 Sites/Worker 실행환경을 사용합니다. 또한 원본의 소유자 인증은 Sites가 넣는 `oai-authenticated-user-*` 헤더에 의존합니다. 독립 서버에서 방문자가 보낸 동일 이름의 헤더를 그대로 신뢰하면 안 됩니다. 따라서 원본 사본과 역복원 실행본은 우선 `recovered/sseolzip/` 아래에 분리 보존하고, 독립 호스팅용 인증·DB·이미지 저장소를 확정한 뒤 배포 경로로 승격해야 합니다.

## 검증

- 22개 원본의 내용·경로로 만든 Git tree가 GitHub에 생성한 tree와 일치: `9297da10d814004f88df22199b6c6c0be1715b68`.
- `ORIGINALS.sha256`에 파일별 SHA-256을 기록했습니다.
- prompt-v2 6개 파일 모두 과거 검토의 `reviewedInputs` 해시·크기와 일치했습니다.
- 원본 검토 패키지의 테스트: 23개 통과, 실패 0개.
- `restored-runtime/` 역복원 테스트: 5개 통과, 실패 0개.

```sh
node recovered/sseolzip/verify-originals.mjs
cd recovered/sseolzip/implementation-review && npm test
cd ../restored-runtime && npm test
```

`implementation-review/baseline/`은 원본 보존용입니다. 패치를 그 안에 직접 적용하면 무결성 검사가 실패합니다.
