# recovered-data

코드가 아니라 **실제로 관측되거나 보존된 데이터 증거**를 따로 모은 디렉터리입니다.

## 이번 추가 회수

### `public-projection-v21.json`
ChatGPT Sites에 남아 있는 `sseolzip` source version 21 / projection revision 43의 공개 화면 텍스트를 그대로 근거로 구조화했습니다.

확인된 실제 공개 상태:
- 게시글 6편
- 직장생활 2 / 인간관계 2 / 일상 2
- 각 글 화면 표시 조회수 **0**
- 추천글 3개
- 최신순 / 오래된순 / 조회수순
- 카드형 / 목록형
- 공개 태그 12개

따라서 이전에 '조회수 실제 값이 전혀 없다'고 적었던 범위는 수정합니다. **source v21 시점의 공개 화면 조회수는 6편 모두 0으로 실제 관측되었습니다.** 다만 그 이전 시점의 누적 이력이나 서버 카운터 로그는 여전히 없습니다.

### `screenshot-evidence.json`
당시 제작실·독서화면·인스타 표지 스크린샷 9개의 파일명, SHA-256, 화면에서 확인 가능한 기능을 기록했습니다. 원본 이미지 파일 자체는 사용자의 Library에 남아 있지만, 이것은 R2/BUCKET의 객체 덤프와는 다른 종류의 증거입니다.

## 추가 수색 결과

Library에서 `sseolzip`, `ssuljib`, D1/database/sqlite/db/export, R2/bucket/images/export 관련 검색과 2026-09-09~11 사이 DB 계열 확장자 목록을 다시 확인했습니다.

현재 발견된 썰판 관련 저장물은 다음이 핵심입니다.
- `ssuljib_implementation_review.zip`
- `ssuljib_master_prompt.zip`
- `ssuljib_master_prompt(1).zip`
- `ssuljib_master_prompt(2).zip`
- `썰집_마스터프롬프트.md`
- UI 스크린샷들
- ChatGPT Sites projection

별도의 `.sqlite`, `.db`, D1 SQL dump, R2 export ZIP, bucket manifest는 발견되지 않았습니다. 이는 현재 Library/GitHub 접근 범위의 수색 결과이며 외부 플랫폼 내부에 데이터가 절대 존재하지 않는다는 의미는 아닙니다.

## 아직 값 자체가 없는 것

1. D1의 비공개 원고/버전/Claude 작업 기록/설정 행의 실제 덤프
2. R2/BUCKET에 저장되었던 실제 업로드 이미지 객체
3. source v21 이전의 조회수 변동 이력

이 값들은 증거 없이 만들어 넣지 않습니다.
