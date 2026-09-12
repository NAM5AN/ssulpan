// String-level review signals, not a semantic grader. No model calls or automatic rewriting.
// Source anchors/names come from a human or a separately reviewed extraction step.
const kinds = ['event', 'dialogue', 'emotion', 'ending'];
const evidence = (text, start, end) => ({start, end, text:text.slice(start, end)});
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
function check(condition, message) { if (!condition) throw new TypeError(message); }
async function hash(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
function sourceSpan(text, span) {
  check(span && Number.isInteger(span.start) && Number.isInteger(span.end) && span.start >= 0 && span.end > span.start && span.end <= text.length, '유효한 원문 근거 구간이 필요합니다.');
  return evidence(text, span.start, span.end);
}
function nameBoundary(text, start, end) {
  // Avoid treating 김민수 inside 김민수진 as the same person. Korean particles are allowed.
  const before = text.slice(Math.max(0, start - 2), start);
  if (/[\p{L}\p{N}_]$/u.test(before)) return false;
  const tail = text.slice(end);
  return !/^[\p{L}\p{N}_]/u.test(tail) || /^(?:(?:님|씨)(?:은|는|이|가|을|를|의|에게|한테|도|만)?|에게서는|에게서|에게|한테서|한테|으로|이랑|랑|와|과|은|는|이|가|을|를|의|도|만)(?=$|[^\p{L}\p{N}_])/u.test(tail);
}
export function findOccurrences(text, needle, {person=false}={}) {
  check(typeof text === 'string' && nonempty(needle), '문자열 검색 인수가 필요합니다.');
  const found = [];
  for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + needle.length)) {
    if (!person || nameBoundary(text, at, at + needle.length)) found.push(evidence(text, at, at + needle.length));
  }
  return found;
}
export function quotedSpans(text) {
  // Quoted text also includes titles/labels; this is not a count of spoken dialogue.
  const pattern = /“[^”]+”|「[^」]+」|『[^』]+』|‘[^’]+’|"[^"\r\n]+"/gu;
  return Array.from(text.matchAll(pattern), m => evidence(text, m.index, m.index + m[0].length));
}
function numberSpans(text) {
  return Array.from(text.matchAll(/\d+(?:,\d{3})*(?:\.\d+)?(?:\s*(?:만원|억원|년|월|일|시|분|초|원|명|개|층|살|번|회|%))?/gu), m => ({...evidence(text, m.index, m.index + m[0].length), key:m[0].replace(/[\s,]/gu, '')}));
}
export async function createSourceBaseline({sourceText, complete, anchors=[], people=[]}) {
  check(typeof sourceText === 'string', '전체 원문 문자열이 필요합니다.');
  check(typeof complete === 'boolean', '원문 수집 완료 여부를 명시해야 합니다.');
  check(Array.isArray(anchors) && Array.isArray(people), 'anchors와 people은 배열이어야 합니다.');
  const ids = new Set();
  for (const anchor of anchors) {
    check(nonempty(anchor.id) && !ids.has(anchor.id), '근거 id는 고유해야 합니다.'); ids.add(anchor.id);
    check(kinds.includes(anchor.kind), '지원하지 않는 근거 종류입니다.');
    const span = sourceSpan(sourceText, anchor.sourceSpan);
    check(Array.isArray(anchor.terms) && anchor.terms.every(nonempty), 'terms는 원문에서 선택한 문자열 배열입니다.');
    check(anchor.terms.every(term => span.text.includes(term)), '검색 단어가 해당 원문 근거에 없습니다.');
  }
  const peopleIds = new Set(), sourceNames = new Set(), resultNames = new Set();
  for (const person of people) {
    check(nonempty(person.id) && !peopleIds.has(person.id), '인물 id는 고유해야 합니다.'); peopleIds.add(person.id);
    check(nonempty(person.sourceName) && nonempty(person.resultName), '원문 이름과 결과 이름이 필요합니다.');
    check(!sourceNames.has(person.sourceName) && !resultNames.has(person.resultName), '동명이인은 이 단순 이름 대응표로 처리할 수 없습니다. 개별 인물 근거를 분리해 주세요.');
    sourceNames.add(person.sourceName); resultNames.add(person.resultName);
    const span = sourceSpan(sourceText, person.sourceSpan);
    check(span.text === person.sourceName, '인물의 원문 근거는 이름과 정확히 일치해야 합니다.');
  }
  return {version:1, sourceHash:await hash(sourceText), complete, anchors:structuredClone(anchors), people:structuredClone(people)};
}
export async function inspectSourcePreservation({sourceText, resultText, baseline, detectedNames=null}) {
  check(typeof sourceText === 'string' && typeof resultText === 'string', '원문과 결과 문자열이 필요합니다.');
  check(baseline?.version === 1 && baseline.sourceHash === await hash(sourceText), '원문이 기준 버전과 다릅니다. 근거 구간을 다시 확인해야 합니다.');
  // Revalidate stored annotations; never trust a stale or tampered manifest.
  await createSourceBaseline({sourceText, complete:baseline.complete, anchors:baseline.anchors, people:baseline.people});
  const report = {
    semanticVerdict:'undetermined', blocksSave:false, autoRetry:false,
    sourceStatus:baseline.complete ? 'complete' : 'incomplete',
    checks:{events:'not_checked', people:'not_checked', dialogue:'not_checked', emotion:'not_checked', ending:'not_checked', unknownNames:'not_checked'},
    quoteStatistics:null, issues:[],
    limitations:['문자열 일치가 의미·인과·감정·반전의 보존을 증명하지 않습니다.', '일치하지 않는 표현은 정상적인 재구성일 수 있습니다.', '이름 탐지에는 외부 NER 또는 사람이 확인한 후보가 필요합니다.'],
  };
  const issue = (code, kind, sourceEvidence, resultEvidence, note) => report.issues.push({code, kind, severity:'review', sourceEvidence, resultEvidence, note});
  if (!baseline.complete) {
    issue('SOURCE_INCOMPLETE', 'source', [], [], '원문 수집이 완료되지 않아 보존 비교를 실행하지 않았습니다.');
    return report;
  }
  for (const person of baseline.people) {
    report.checks.people = 'literal_signals_only';
    const original = sourceSpan(sourceText, person.sourceSpan);
    const mentions = findOccurrences(resultText, person.resultName, {person:true});
    if (!mentions.length) issue('MAPPED_NAME_NOT_FOUND', 'people', [original], [], `${person.resultName} 표기가 없습니다. 대명사·생략·다른 표현일 수 있습니다.`);
    if (person.sourceName !== person.resultName) {
      const old = findOccurrences(resultText, person.sourceName, {person:true});
      if (old.length) issue('SOURCE_NAME_REMAINS', 'people', [original], old, '익명화 전 표기가 남아 있습니다. 해당 이름의 문맥을 확인하세요.');
    }
  }
  if (detectedNames !== null) {
    check(Array.isArray(detectedNames), 'detectedNames는 별도로 확인한 이름 후보 배열입니다.');
    report.checks.unknownNames = 'supplied_candidates_only';
    const known = new Set(baseline.people.map(p => p.resultName));
    for (const item of detectedNames) {
      check(nonempty(item.name), '이름 후보 문자열이 필요합니다.');
      const span = sourceSpan(resultText, item.span);
      check(span.text === item.name, '결과 이름 후보의 근거가 일치하지 않습니다.');
      if (!known.has(item.name)) issue('UNMAPPED_NAME_CANDIDATE', 'people', [], [span], '대응표에 없는 이름 후보입니다. 새 인물이라고 확정하지 않습니다.');
    }
  }
  for (const anchor of baseline.anchors) {
    const source = sourceSpan(sourceText, anchor.sourceSpan);
    if (anchor.kind === 'emotion') continue; // Deliberately not grading emotions with keywords.
    const category = {event:'events', dialogue:'dialogue', ending:'ending'}[anchor.kind];
    report.checks[category] = 'literal_signals_only';
    for (const term of anchor.terms) {
      const renamed = baseline.people.find(person => person.sourceName === term)?.resultName ?? term;
      if (!findOccurrences(resultText, renamed).length) {
        issue('ANCHOR_TERM_NOT_FOUND', anchor.kind, [source], [], `근거 단어 '${renamed}'가 없습니다. 동의어·간접 표현 여부를 확인하세요.`);
      }
    }
    if (anchor.kind === 'ending') {
      const resultNumbers = numberSpans(resultText);
      for (const number of numberSpans(source.text)) {
        if (!resultNumbers.some(candidate => candidate.key === number.key)) {
          issue('ENDING_NUMBER_NOT_FOUND', 'ending', [evidence(sourceText, source.start + number.start, source.start + number.end)], resultNumbers.map(({key,...span}) => span), '결말 근거의 수치 표기가 결과에 없습니다. 숫자의 역할이나 한글 표기를 사람이 확인하세요.');
        }
      }
    }
  }
  const sourceQuotes = quotedSpans(sourceText), resultQuotes = quotedSpans(resultText);
  report.quoteStatistics = {source:sourceQuotes.length, result:resultQuotes.length};
  report.checks.dialogue = 'quote_statistics_and_optional_anchors';
  if (sourceQuotes.length !== resultQuotes.length) issue('QUOTED_SPAN_COUNT_CHANGED', 'dialogue', sourceQuotes, resultQuotes, '따옴표 구간 수가 달라졌습니다. 직접·간접화법 변경이나 인용 표기 차이일 수 있으며 오류 판정이 아닙니다.');
  return report;
}
