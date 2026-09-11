# 썰집 분량 정책 구현 검토

이번 ZIP은 검토문, 현재 코드 기준 적용용 diff, 실행 가능한 검사·보정 모듈입니다. 운영 사이트와 업로드한 원본 ZIP은 변경하지 않았습니다.

## 파일

| 파일 | 용도 |
|---|---|
| 검토결과.md | 요청한 5개 항목의 검토와 추가 수정 사항 |
| patches/01-length-options.patch | cleanDraft, promptFor, UI collect, rewrite target 검증의 실제 수정 diff |
| src/social-repair.mjs | 전체 본문 컨텍스트 구성, 보정 API 어댑터, 필드별 검증, 허용 필드만 적용 |
| src/source-preservation.mjs | 원문 근거 기반의 문자열 검사와 검토 후보 출력 |
| examples/preservation-demo.mjs | 원문 보존 검사의 실행 예제 |
| examples/report.json | 예제를 실행해서 얻은 실제 검사 결과 |
| tests/*.test.mjs | 실제 diff 적용 및 동작 검증 23개 |
| baseline/ | diff를 재현 검증하기 위한 기존 파일 사본 |
| input-manifest.json | 검토한 입력 파일의 SHA-256 및 코드 기준 커밋 |

## 실행

Node.js와 Git이 필요합니다. 외부 npm 패키지는 사용하지 않습니다. Node.js v24.19.0에서 테스트했습니다.

```bash
npm test
npm run demo
```

23개 테스트가 통과했습니다. Claude 호출은 모의 함수로 검증했으며 실제 유료 API 호출은 하지 않았습니다. 테스트가 임시 디렉터리에 baseline을 복사하고 실제 patch를 적용한 다음 cleanDraft와 promptFor를 import합니다.

## 옵션 diff 적용

기준: `/workspace/sites/sseolzip`, 커밋 `a5a8d9a1acc6047cefa38b53952e00dfb1d20d53`.

대상 저장소에서 아래 명령을 실행합니다. 패치 경로는 압축을 푼 위치에 맞춥니다.

```bash
git apply --check /absolute/path/ssuljib_implementation_review/patches/01-length-options.patch
git apply /absolute/path/ssuljib_implementation_review/patches/01-length-options.patch
```

diff는 다음 동작을 제공합니다.

- legacy options.length는 항상 폐기합니다.
- mode 누락/source/빈 요청/숫자 타입 요청은 source로 정규화합니다.
- custom + 비어 있지 않은 문자열 요청만 보존합니다.
- 생성·부분 수정에는 lengthRequest만 전달하고, social 등에는 전달하지 않습니다.
- action과 rewrite target을 모델 참고 JSON에 명시합니다.
- 서버와 promptFor 모두 잘못된 rewrite target을 거절합니다.
- UI collect가 기존의 유효한 custom 요청을 잃지 않게 합니다. 새 분량 UI는 추가하지 않습니다. 토글을 구현할 경우 사용자 조작 시 current.data.options에 mode/request를 저장하고 해제 시 request를 제거해야 합니다.

이 diff는 분량 요청 전달을 위한 변경입니다. 기존 string()의 내용 절단, OCR 영속 저장, 전체 사이트의 자동 보정 연결은 별도 구현 대상입니다. 패치 파일만 적용해서 전체 정책 이행이 끝났다고 간주하지 마세요.

## social 보정 연결

```js
import {createSocialRepairAdapter, repairSocialOnce} from './src/social-repair.mjs';

// sendMessages는 기존 서버의 인증된 Anthropic 호출을 재사용하는 함수입니다.
// 응답 JSON을 그대로 반환하고, string()/cleanDraft()/기존 validateResult('social')로
// 먼저 자르거나 변경하면 안 됩니다.
const callModel = createSocialRepairAdapter({sendMessages, model, maxTokens});

const {candidate, baseRevision, warnings} = await repairSocialOnce({
  draft: currentDraft,
  revision: currentRevision,
  fields: ['hashtags'], // 서버가 검증 오류로 결정한 필드만
  callModel,
  loadCurrent: () => loadDraftWithRevision(), // 같은 DB 조회에서 {draft, revision} 반환
});
```

loadDraftWithRevision은 프로젝트 저장소 인터페이스입니다. 원고와 revision을 같은 DB 조회/스냅샷으로 읽어 반환해야 합니다.

모듈은 저장하지 않고 candidate를 반환합니다. 저장 시에도 `UPDATE ... WHERE revision = baseRevision` 형태의 원자적 갱신을 실행하고 영향 행 수를 확인해야 합니다. 검사 직후 저장 전 다른 요청이 수정하는 경쟁 상태는 메모리 hash 검사만으로 막을 수 없습니다. 최초 생성 후보라서 기존 draft revision이 아직 없으면 서버가 보관한 생성 작업 결과의 ID와 버전을 기준으로 후보를 관리하세요.

보정 요청은 제목, 분류, 광고 전·후 본문 전체, 기존 social 값, 허용 필드와 검증 오류를 포함합니다. 원문, OCR, 기존 축약 요청, storyBible은 보내지 않습니다. 결말도 컨텍스트에 보내되 부가 문구에는 노출하지 말라고 지시합니다. 결말을 알아야 스포일러를 피하고 사실 관계를 지킬 수 있습니다.

응답은 social 스키마의 다섯 필드지만 적용은 fields 목록만 수행합니다. 허용하지 않은 필드 변경은 폐기하고 본문을 추가 필드로 반환하면 응답을 거절합니다. 새 본문이 입력된 경우 revision/hash 비교로 오래된 보정을 적용하지 않습니다. 모듈 내부의 재호출 루프는 없으며 보정 한 번당 모델 호출은 한 번입니다.

기존 claudeRequest()는 응답을 validateResult()에 바로 통과시킵니다. 보정 연결 시 raw tool input 추출과 업무별 검증을 분리해야 합니다. 전체 생성 후보의 본문이 유효하고 부가 필드만 잘못된 경우, 원본 후보를 먼저 서버 작업 결과로 보존한 뒤 해당 후보를 보정 대상으로 사용하세요. 스키마 오류를 통째로 예외 처리해 후보를 버리면 보정 경로에 도달할 수 없습니다.

social로 고칠 수 있는 필드는 titles/hook/coverDetail/caption/hashtags입니다. title/category/teaser/gateLine/storyBible/imageText는 이 스키마로 수정할 수 없습니다. 그런 오류는 별도 보정 계약이나 사용자 편집으로 처리해야 합니다.

## 원문 보존 검사 연결

`createSourceBaseline()`은 전체 원문, 수집 완료 여부, 근거 구간, 확인된 인물 대응표로 기준을 만듭니다. `inspectSourcePreservation()`은 그 기준과 생성 본문을 비교합니다. 실제 사용 예제는 examples/preservation-demo.mjs에 있습니다.

근거 구간의 start/end는 JavaScript 문자열의 UTF-16 오프셋입니다. 원문은 근거를 만든 이후 개행·공백을 정규화하지 않습니다. SHA-256은 원문 변경 여부 확인용이며 신뢰성 서명이 아닙니다. 기준·대응표는 서버에서 원문 버전과 함께 보관하고 생성 결과가 덮어쓰지 않게 하세요.

앵커와 이름 대응표는 사람이 지정하거나 별도로 추출·검토한 입력입니다. 이 모듈은 한국어 NER, 형태소 분석, 인과 추론 모델을 포함하지 않습니다. detectedNames를 제공하면 근거 위치를 확인한 뒤 대응표에 없는 후보를 표시합니다. 미제공 시 unknownNames는 not_checked입니다.

검사 결과는 항상 semanticVerdict=undetermined, blocksSave=false, autoRetry=false입니다. 결과가 정상이라는 판정이나 자동 재생성 지시로 사용하지 않습니다. 문제 후보에는 원문/결과의 실제 근거 위치와 텍스트를 포함하며, 대응 구간이 없으면 빈 배열을 반환합니다. 감정은 판정하지 않습니다.

의미 반전인데 키워드는 모두 남아 있는 사례도 테스트에 포함했습니다. 이 경우 문자열 검사는 아무 문제를 찾지 못할 수 있으며, 보고서는 여전히 의미 보존을 확인하지 못했다고 표시합니다.

화면에 근거 텍스트를 넣을 때는 textContent 또는 프레임워크의 기본 escaping을 사용하세요. 후보에 포함된 원문 문자열을 HTML로 실행하지 않습니다.
