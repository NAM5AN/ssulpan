# 썰판 (ssulpan)

기존 ChatGPT Sites `sseolzip` 프로젝트를 GitHub로 복구하는 저장소입니다.

## 복구 상태

- `recovered/sseolzip/implementation-review/` — 회수한 실제 원본 코드·패치·테스트 사본
- `recovered/sseolzip/prompt-v2/` — 회수한 실제 마스터 프롬프트·결과 스키마 사본
- `recovered/sseolzip/restored-runtime/` — 누락됐던 렌더러·콘텐츠 호환 데이터·설정·표지 렌더러·DB 스키마·빌드 파이프라인을 살아남은 원본 계약과 당시 화면을 근거로 역복원한 실행 호환본

원본 22개 파일은 별도로 무결성 검증되어 있으며, `restored-runtime`은 원본 바이트가 없던 파일을 **원본이라고 속이지 않고 별도 경로에서 역복원**한 버전입니다.

자세한 복구 범위와 검증 결과는 [`recovered/sseolzip/README.md`](recovered/sseolzip/README.md)를 확인하세요.

## 아직 실제 원본 값이 없는 것

당시 서버의 D1 실제 행 데이터, R2/BUCKET 이미지 객체, 누적 조회수의 역사적 값은 원본 덤프가 발견되지 않아 복원값을 임의 생성하지 않았습니다. 코드/스키마/호환 런타임은 복구되어 있습니다.

## 검증

```sh
node recovered/sseolzip/verify-originals.mjs
cd recovered/sseolzip/implementation-review && npm test
cd ../restored-runtime && npm test
```

`restored-runtime`의 복구 테스트는 현재 5/5 통과합니다.

<!-- Instagram carousel style refresh 2026-09-15 -->
