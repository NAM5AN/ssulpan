# Claude 생성 오류 진단 및 복구

## 2026-09-12 수정

전체 생성의 `deliver_result`에서 `gateLine`이 빠지면 본문까지 전체 실패하던 문제를 수정했다. 제공사 요청에는 `strict: true`를 적용하며, 제공사가 지원하지 않는 JSON Schema 길이/수치 제약은 설명으로 전달한다. 서버의 기존 필드 검증은 유지한다. 본문 목표 글자 수나 광고 전후 비율은 추가하지 않는다.

완성된 광고 전후 본문이 있을 때만 누락·형식·기술 용량 문제가 있는 부가 메타데이터를 한 번 보정한다. 표지·캡션 등은 기존 social 보정 경로에서 별도 한 번만 보정한다. 보정에는 광고 전후 본문 전체를 읽기 전용으로 전달하며, 지정된 부가 필드만 병합한다. 원문 재생성·자동 요약·자동 절단·무한 재시도를 하지 않는다.

## 운영 경로

- 제작실의 `이전 원고·작업 기록` → 각 작업의 `진단 보기` → `진단 내역 복사`.
- 최근 실패는 생성 버튼 아래 `작업 진단`이 열린다. 성공 진단도 접힌 상태로 확인할 수 있다.
- `GET /api/jobs/{jobId}/diagnostics`는 작업 번호, 서버 버전, 단계, 모델, 시간, 호출별 HTTP 상태·제공사 request ID·stop reason·토큰 사용량·필드 검사·보정 내역을 반환한다.
- 실패한 전체 생성의 `빠진 부가 항목 복구`는 보관된 본문을 다시 생성하지 않고 부가 필드만 보정한다. 본문 자체가 누락된 결과는 이 방법으로 복구할 수 없다.
- 복구도 새 작업 번호를 가진다. `recoveredFrom`으로 이전 작업과 연결된다. `baseData`는 이전 생성 당시의 필드 해시를 유지해 오래된 결과의 덮어쓰기를 감지한다.
- 결과는 자동 게시하거나 원고에 자동 적용하지 않는다. 사용자가 `결과 보기` 후 `원고에 반영`한다.

## 저장 및 조사

`ssul_jobs.result.diagnostics`에 단계별 체크포인트와 최종 진단을 남긴다. 연결이 끊겼더라도 서버 작업이 계속될 수 있으므로 기록 상태를 확인한다. 작업 번호를 재사용하면 완료 결과를 재조회하거나 중복 실행을 차단한다.

제공사의 원본 HTTP 성공 응답(불완전한 도구 응답 포함)은 비공개 `ssul_private` 버킷의 `private/{ownerHash}/responses/{jobId}/{callIndex}.json`에 저장한다. 도구 후보는 기존 `private/{ownerHash}/candidate/{jobId}`에 남긴다. 진단 복사에는 API 키, 요청 프롬프트, 본문 원문, 이미지 데이터, 원본 응답 전문을 포함하지 않는다. 공개 인증을 사용하지 않는 공유 제작실이라는 기존 접근 정책은 동일하다.

이전 작업은 보관된 후보의 필드를 검사해 누락 항목을 복원한다. 과거에 기록하지 않았던 request ID나 stop reason은 추측해서 채우지 않는다. 원본 응답 저장이 실패하면 `rawSaved: false`로 표시한다.

| 코드 | 의미 | 조사 위치 |
| --- | --- | --- |
| RESULT_SCHEMA_INVALID | 필드 누락·추가·형식/부가 용량 문제 | error.fields 및 providerCalls[].fields |
| SOCIAL_REPAIR_FAILED | 부가 문구 보정 실패 | error.fields.cause 및 social 호출 |
| INCOMPLETE_OUTPUT | 출력/컨텍스트 한도로 응답 중단 | stopReason 및 usage |
| INVALID_TOOL_RESULT | 완성된 deliver_result가 아님 | stopReason 및 비공개 원본 응답 |
| PROVIDER_HTTP_* | 제공사의 HTTP 실패 | provider.type/message/requestId |
| PROVIDER_TIMEOUT / PROVIDER_NETWORK | 제공사 연결 실패 | stage 및 elapsedMs |
| WORKER_CONNECTION / CLIENT_CONNECTION | 중계 또는 브라우저 연결 종료 | 작업 번호로 서버 상태 재조회 |
| REWRITE_OUTSIDE_SCOPE | 선택 범위 밖 문자열 변경 | 대상 구간과 생성 후보 비교 |

## 수정 시 필수 검증

`python3 scripts/build-original.py` 후 `node --test tests/original-ui.test.mjs`를 실행한다(Node 24). 테스트는 모든 작업 라우팅, gateLine 누락 재현, 본문 불변 보정, strict 스키마 호환, 실제 파이프라인의 호출·진단 기록, 제공사 오류와 키 마스킹, 중계 오류 전달을 검사한다. 유료 실환경 검증은 대상 원고의 결과 제안까지만 생성하고 자동 적용·게시하지 않는다.
