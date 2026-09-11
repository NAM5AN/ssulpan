import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSocialRepairRequest, applySocialRepair, repairSocialOnce, socialIssues, readCompleteToolResult, createSocialRepairAdapter} from '../src/social-repair.mjs';
const fixture = () => ({title:'내 후임이 먼저 왔다', category:'직장생활', beforeContent:'월요일 아침이었다. “인수인계 받으러 왔습니다.”', afterContent:'사직서를 낸 적은 없었다. 알고 보니 다른 팀으로 옮기는 일이었다.', titles:['내 후임이 먼저 왔다','책상 옆의 신입','사직서는 낸 적 없는데'], hook:'내 후임이\n먼저 왔다', coverDetail:'인수인계 받으러 왔습니다.', caption:'어떤 상황일까? 전체 글은 프로필 링크에서', hashtags:'#썰집 #썰 #회사 #직장 #인수인계', notes:'본문을 늘려줘', sourceText:'보정에 불필요한 원문', options:{lengthMode:'custom',lengthRequest:'두 배로 늘려줘'}, storyBible:'비공개 원문 이름 대응표', fadeHeight:180});
const responseOf = draft => Object.fromEntries(['titles','hook','coverDetail','caption','hashtags'].map(k => [k, structuredClone(draft[k])]));
test('repair sends full before/after with frozen title and no source, rewrite or length instructions', async () => {
  const draft = fixture(); draft.afterContent += '끝 장면 보존'.repeat(10000);
  const request = await buildSocialRepairRequest(draft, {fields:['hashtags'], revision:3});
  const context = JSON.parse(request.providerRequest.text);
  assert.equal(context.action, 'social');
  assert.equal(context.frozenContent.afterContent, draft.afterContent);
  assert.deepEqual(context.allowedFields, ['hashtags']);
  assert.ok(!request.providerRequest.text.includes('두 배로 늘려줘'));
  assert.ok(!request.providerRequest.text.includes('비공개 원문 이름'));
});
test('only requested fields are applied even if model changes other social fields', async () => {
  const draft = fixture(), original = structuredClone(draft);
  const request = await buildSocialRepairRequest(draft, {fields:['hashtags'], revision:1});
  const response = {...responseOf(draft), hook:'원하지 않은 변경', caption:'다른 캡션', hashtags:'#썰집 #썰 #직장생활 #신입 #월요일'};
  const {candidate} = await applySocialRepair(draft, response, request, {revision:1});
  assert.deepEqual(candidate, {...original, hashtags:response.hashtags});
  assert.deepEqual(draft, original);
});
test('body injection and missing fields are rejected', async () => {
  const draft = fixture(), request = await buildSocialRepairRequest(draft, {fields:['hashtags'], revision:1});
  await assert.rejects(applySocialRepair(draft, {...responseOf(draft), beforeContent:'변경'}, request, {revision:1}), {code:'INVALID_RESPONSE_FIELDS'});
  await assert.rejects(applySocialRepair(draft, {hashtags:draft.hashtags}, request, {revision:1}), {code:'INVALID_RESPONSE_FIELDS'});
});
test('revision or content changes make repair stale', async () => {
  const draft = fixture(), request = await buildSocialRepairRequest(draft, {fields:['hashtags'], revision:1});
  await assert.rejects(applySocialRepair(draft, responseOf(draft), request, {revision:2}), {code:'STALE_DRAFT'});
  await assert.rejects(applySocialRepair({...draft, afterContent:'사용자가 바꾼 결말'}, responseOf(draft), request, {revision:1}), {code:'STALE_DRAFT'});
});
test('hook recommendations warn but do not fail; cover quote must exist in body', async () => {
  const draft = fixture(), request = await buildSocialRepairRequest(draft, {fields:['hook'], revision:1});
  const result = await applySocialRepair(draft, responseOf(draft), request, {revision:1});
  assert.equal(result.warnings[0].code, 'RECOMMENDED_LINES');
  assert.ok(socialIssues({...draft, coverDetail:'원문에 없던 새로운 대사'}, ['coverDetail']).errors.some(e => e.code === 'EXCERPT_NOT_IN_BODY'));
});
test('repair rejects invalid tags and fixed-title omission without any truncation', async () => {
  const draft = fixture();
  for (const [field, value] of [['hashtags','#썰집 #썰 #직장 #직장 #신입'], ['titles',['다른 제목','또 다른 제목','세 번째 제목']], ['coverDetail','가'.repeat(41)]]) {
    const request = await buildSocialRepairRequest(draft, {fields:[field], revision:1});
    await assert.rejects(applySocialRepair(draft, {...responseOf(draft), [field]:value}, request, {revision:1}), {code:'REPAIR_VALIDATION'});
  }
});
test('one repair call returns a candidate and provider failure never overwrites source', async () => {
  const draft = fixture(); let calls=0;
  const result = await repairSocialOnce({draft, revision:1, fields:['hashtags'], callModel:async () => {calls++;return responseOf(draft);}, loadCurrent:async () => ({draft, revision:1})});
  assert.equal(calls, 1); assert.deepEqual(result.candidate, draft);
  await assert.rejects(repairSocialOnce({draft, revision:1, fields:['hashtags'], callModel:async () => {throw new Error('max_tokens');}, loadCurrent:async () => {throw new Error('must not apply');}}), /max_tokens/);
  assert.equal(draft.beforeContent, fixture().beforeContent);
});
test('even well-shaped tool input is rejected on an incomplete stop reason', () => {
  for (const stop_reason of ['max_tokens','model_context_window_exceeded']) {
    assert.throws(() => readCompleteToolResult({stop_reason,content:[{type:'tool_use',name:'deliver_result',input:responseOf(fixture())}]}), {code:'INCOMPLETE_OUTPUT'});
  }
});
test('adapter passes the full repair context once and returns raw untruncated fields', async () => {
  const request=await buildSocialRepairRequest(fixture(),{fields:['hashtags'],revision:1}); let captured;
  const raw={...responseOf(fixture()),caption:'가'.repeat(5001)};
  const call=createSocialRepairAdapter({model:'test-model',maxTokens:8000,sendMessages:async payload=>{captured=payload;return {stop_reason:'tool_use',content:[{type:'tool_use',name:'deliver_result',input:raw}]};}});
  assert.deepEqual(await call(request.providerRequest),raw);
  assert.equal(captured.messages[0].content[0].text,request.providerRequest.text);
  assert.equal(captured.tools[0].strict,true);
  assert.equal(captured.tools[0].input_schema.additionalProperties,false);
});
