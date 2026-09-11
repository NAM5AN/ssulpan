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

## 아직 확보하지 못한 원본

| 누락 | 영향 |
|---|---|
| `worker/render.mjs` | 목록·상세 읽기·이어읽기 화면의 실제 렌더러 없음 |
| `content.json` | 원래 6개 글의 전체 본문·이미지 연결·태그 등 원본 데이터 없음 |
| `config.json` | 기존 광고 등 사이트 설정 원본 없음 |
| `.sites-runtime/assets.json`, `build.py`, 나머지 `public/` | 원래 HTML/CSS, 공개 화면 스크립트와 빌드 산출물 미확보 |
| `window.SseolzipCover.draw`를 정의하는 파일 | 표지 문구 생성·PNG 저장 호출은 있지만 실제 표지 그리기 코드 없음 |
| 이미지 파일·버킷 자료 | 실제 배너·썸네일·업로드 이미지 원본 없음 |
| DB 스키마/마이그레이션·데이터 내보내기 | 원고·게시글·이력·작업 기록·공유 조회수 등의 데이터 이전 미완료 |

예전 재구성본의 짧은 샘플 본문과 임의 조회수는 원본 데이터가 아닙니다. 이를 실제 글·조회수로 이전 처리하지 않았습니다. 배너 슬라이드·썸네일도 원본과 동일하게 복구했다고 주장하지 않습니다.

## 왜 실행 경로를 덮어쓰지 않았는가

원본 서버는 위의 누락 파일을 import하며 `env.DB`, `env.BUCKET`, `ctx.waitUntil` 등 Sites/Worker 실행환경을 사용합니다. 파일 세 개를 루트에 덮어쓰면 원래 사이트가 실행되는 것이 아니라 의존성 누락으로 실패합니다.

원본의 소유자 인증은 Sites가 넣는 `oai-authenticated-user-*` 헤더에 의존합니다. 독립 서버에서 방문자가 보낸 동일 이름의 헤더를 그대로 신뢰하면 안 됩니다. 독립 호스팅용 인증·DB·이미지 저장소 연결이 별도로 필요합니다. 이 작업에서 비밀키를 복사하거나 새 유료 서비스·배포를 만들지 않았습니다. 루트의 재구성 API에도 운영용 인증 등이 갖춰지지 않았으므로 API 키를 넣어 바로 공개 운영하지 마세요.

## 검증

- 22개 원본의 내용·경로로 만든 Git tree가 GitHub에 생성한 tree와 일치: `9297da10d814004f88df22199b6c6c0be1715b68`.
- `ORIGINALS.sha256`에 파일별 SHA-256을 기록했습니다.
- prompt-v2 6개 파일 모두 과거 검토의 `reviewedInputs` 해시·크기와 일치했습니다.
- 이번 환경 Node.js v22.16.0에서 `npm test` 재실행: 23개 통과, 실패 0개.
- 테스트는 임시 사본에 실제 diff를 적용합니다. Claude는 모의 호출입니다. 실제 브라우저 전체 흐름, DB, 유료 Claude API, Vercel 배포 검증은 하지 않았습니다.

```sh
node recovered/sseolzip/verify-originals.mjs
cd recovered/sseolzip/implementation-review
npm test
```

`baseline/`은 보존용입니다. 패치를 그 안에 직접 적용하면 무결성 검사가 실패합니다. 원본의 전체 코드·데이터가 확보된 다음 별도 실행용 디렉터리 또는 브랜치에서 연결 작업을 해야 합니다.
