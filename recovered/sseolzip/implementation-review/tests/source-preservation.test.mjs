import test from 'node:test';
import assert from 'node:assert/strict';
import {createSourceBaseline, inspectSourcePreservation, findOccurrences, quotedSpans} from '../src/source-preservation.mjs';
const sourceText = '김민수는 사직서를 낸 적이 없었다.\n“인수인계 받으러 왔습니다.” 신입이 말했다.\n메일은 9월 1일에 왔다. 퇴사가 아니라 팀 이동이었다.';
const spanOf = text => ({start:sourceText.indexOf(text), end:sourceText.indexOf(text) + text.length});
const options = () => ({sourceText, complete:true, anchors:[
  {id:'resignation', kind:'event', sourceSpan:spanOf('김민수는 사직서를 낸 적이 없었다.'), terms:['사직서']},
  {id:'quote', kind:'dialogue', sourceSpan:spanOf('“인수인계 받으러 왔습니다.”'), terms:['인수인계']},
  {id:'ending', kind:'ending', sourceSpan:spanOf('메일은 9월 1일에 왔다. 퇴사가 아니라 팀 이동이었다.'), terms:['팀 이동']},
], people:[{id:'narrator', sourceName:'김민수', resultName:'김도윤', sourceSpan:spanOf('김민수')}]});
test('name aliases accept Korean particles but not a different longer name', () => {
  assert.equal(findOccurrences('김도윤은 왔다. 김도윤에게 물었다.', '김도윤', {person:true}).length, 2);
  assert.equal(findOccurrences('김도윤진은 왔다.', '김도윤', {person:true}).length, 0);
});
test('matching surface cues never claim semantic preservation', async () => {
  const baseline = await createSourceBaseline(options());
  const report = await inspectSourcePreservation({sourceText, baseline, resultText:sourceText.replaceAll('김민수', '김도윤')});
  assert.equal(report.issues.length, 0);
  assert.equal(report.semanticVerdict, 'undetermined');
  assert.equal(report.checks.emotion, 'not_checked');
  assert.equal(report.autoRetry, false);
});
test('missing events, old names and changed ending numbers carry actual source evidence', async () => {
  const baseline = await createSourceBaseline(options());
  const resultText = '김민수는 출근했다. “업무를 알려 주세요.” 메일은 10월 2일에 왔다.';
  const report = await inspectSourcePreservation({sourceText, baseline, resultText});
  for (const code of ['MAPPED_NAME_NOT_FOUND','SOURCE_NAME_REMAINS','ANCHOR_TERM_NOT_FOUND','ENDING_NUMBER_NOT_FOUND']) assert.ok(report.issues.some(x => x.code === code));
  for (const item of report.issues) {
    for (const e of item.sourceEvidence) assert.equal(sourceText.slice(e.start, e.end), e.text);
    for (const e of item.resultEvidence) assert.equal(resultText.slice(e.start, e.end), e.text);
  }
  assert.equal(report.blocksSave, false);
});
test('direct to indirect speech is informational, not a generation failure', async () => {
  const baseline = await createSourceBaseline(options());
  const resultText = sourceText.replaceAll('김민수', '김도윤').replace('“인수인계 받으러 왔습니다.”', '인수인계를 받으러 왔다고 했다.');
  const report = await inspectSourcePreservation({sourceText, baseline, resultText});
  assert.equal(report.quoteStatistics.source, 1); assert.equal(report.quoteStatistics.result, 0);
  assert.ok(report.issues.some(x => x.code === 'QUOTED_SPAN_COUNT_CHANGED'));
  assert.equal(report.blocksSave, false); assert.equal(report.autoRetry, false);
});
test('changed source and invalid evidence anchors are rejected before comparison', async () => {
  const baseline = await createSourceBaseline(options());
  await assert.rejects(inspectSourcePreservation({sourceText:sourceText+'수정', resultText:'결과', baseline}), /기준 버전/);
  await assert.rejects(createSourceBaseline({...options(), anchors:[{id:'bad',kind:'event', sourceSpan:{start:0,end:99999},terms:[]}]}), /근거 구간/);
});
test('incomplete source is explicitly not checked', async () => {
  const baseline = await createSourceBaseline({...options(), complete:false});
  const report = await inspectSourcePreservation({sourceText, resultText:'결과', baseline});
  assert.equal(report.sourceStatus, 'incomplete'); assert.equal(report.quoteStatistics, null);
  assert.equal(report.issues[0].code, 'SOURCE_INCOMPLETE');
});
test('new-name candidates require evidence and are not asserted as new people', async () => {
  const baseline = await createSourceBaseline(options()), resultText='김도윤은 정다현을 만났다.';
  const start = resultText.indexOf('정다현');
  const report = await inspectSourcePreservation({sourceText, resultText, baseline, detectedNames:[{name:'정다현',span:{start,end:start+3}}]});
  assert.ok(report.issues.some(x => x.code === 'UNMAPPED_NAME_CANDIDATE'));
  assert.equal(report.checks.unknownNames, 'supplied_candidates_only');
  await assert.rejects(inspectSourcePreservation({sourceText,resultText,baseline,detectedNames:[{name:'정다현',span:{start:0,end:3}}]}), /근거가 일치/);
});
test('semantic reversal with identical keywords remains unverified, not a false pass', async () => {
  const baseline = await createSourceBaseline(options());
  const resultText = sourceText.replaceAll('김민수', '김도윤').replace('사직서를 낸 적이 없었다', '사직서를 제출했다');
  const report = await inspectSourcePreservation({sourceText, resultText, baseline});
  assert.equal(report.semanticVerdict, 'undetermined');
  assert.equal(report.issues.length, 0); // Explicit limitation: keyword presence cannot detect this reversal.
});
test('quotation parsing and number formatting remain diagnostic', async () => {
  assert.equal(quotedSpans('“대사”와 "제목"과 「인용」').length, 3);
  const text='정산액은 1,000원이었다.';
  const baseline=await createSourceBaseline({sourceText:text,complete:true,anchors:[{id:'end',kind:'ending',sourceSpan:{start:0,end:text.length},terms:[]}]});
  const report=await inspectSourcePreservation({sourceText:text,resultText:'정산액은 1000원이었다.',baseline});
  assert.ok(!report.issues.some(x=>x.code==='ENDING_NUMBER_NOT_FOUND'));
});
