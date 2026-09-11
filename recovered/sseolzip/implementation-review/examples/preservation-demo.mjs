import {createSourceBaseline, inspectSourcePreservation} from '../src/source-preservation.mjs';
const sourceText = '김민수는 사직서를 낸 적이 없었다. “인수인계 받으러 왔습니다.” 신입이 말했다. 메일 날짜는 9월 1일이었다. 퇴사가 아니라 팀 이동이었다.';
const resultText = '김도윤은 출근했다. 신입이 인수인계를 받으러 왔다고 했다. 메일 날짜는 9월 2일이었다.';
const range = quote => ({start:sourceText.indexOf(quote), end:sourceText.indexOf(quote)+quote.length});
// These annotations are explicitly provided, not fabricated by an automatic extractor.
const baseline = await createSourceBaseline({
  sourceText, complete:true,
  people:[{id:'narrator', sourceName:'김민수', resultName:'김도윤', sourceSpan:range('김민수')}],
  anchors:[
    {id:'event',kind:'event',sourceSpan:range('김민수는 사직서를 낸 적이 없었다.'),terms:['사직서']},
    {id:'ending',kind:'ending',sourceSpan:range('메일 날짜는 9월 1일이었다. 퇴사가 아니라 팀 이동이었다.'),terms:['팀 이동']},
  ],
});
console.log(JSON.stringify(await inspectSourcePreservation({sourceText, resultText, baseline}), null, 2));
