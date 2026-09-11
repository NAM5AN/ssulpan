import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, cpSync, rmSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
const root = fileURLToPath(new URL('..', import.meta.url));
const directory = mkdtempSync(join(tmpdir(), 'ssuljib-patch-'));
cpSync(join(root, 'baseline'), directory, {recursive:true});
execFileSync('git', ['apply', '--check', join(root, 'patches/01-length-options.patch')], {cwd:directory});
execFileSync('git', ['apply', join(root, 'patches/01-length-options.patch')], {cwd:directory});
const {cleanDraft, promptFor, normalizeWritingOptions} = await import(pathToFileURL(join(directory, 'worker/core.mjs')));
after(() => rmSync(directory, {recursive:true, force:true}));
const context = prompt => JSON.parse(prompt.text.split('참고 데이터:\n').at(-1));
test('legacy numeric length, missing mode and automatic source mode never become instructions', () => {
  for (const options of [{length:2000}, {lengthRequest:'줄여줘'}, {lengthMode:'source', lengthRequest:'늘려줘'}, {lengthMode:'custom', lengthRequest:'   '}, {lengthMode:'custom', lengthRequest:2000}]) {
    const draft = cleanDraft({options});
    assert.equal(draft.options.lengthMode, 'source');
    assert.ok(!('lengthRequest' in context(promptFor('generate', draft)).options));
    assert.ok(!('length' in draft.options));
  }
});
test('explicit request survives cleanDraft and reaches generation and rewrite only', () => {
  const request = '중복 설명만 정리해줘. 대사와 결말은 살려줘.';
  const draft = cleanDraft({options:{tone:'음슴체', lengthMode:'custom', lengthRequest:request}, beforeContent:'앞', afterContent:'뒤'});
  assert.equal(draft.options.lengthRequest, request);
  for (const action of ['generate', 'rewrite']) {
    const input = context(promptFor(action, draft, action === 'rewrite' ? 'after' : undefined));
    assert.equal(input.action, action);
    assert.equal(input.options.lengthRequest, request);
    assert.ok(!('lengthMode' in input.options));
  }
  const social = context(promptFor('social', draft));
  assert.ok(!('lengthRequest' in social.options));
});
test('invalid rewrite target is rejected instead of choosing before', () => {
  for (const target of [undefined, '', 'all']) assert.throws(() => promptFor('rewrite', cleanDraft({}), target), e => e.status === 400);
});
test('explicit request text is not silently truncated', () => {
  const request = '문장 호흡을 다듬어줘. '.repeat(250);
  assert.equal(normalizeWritingOptions({lengthMode:'custom', lengthRequest:request}).lengthRequest, request.trim());
});
test('UI collect preserves a saved explicit request but drops legacy values', () => {
  const source = readFileSync(join(directory, 'public/studio.js'), 'utf8');
  const collect = source.slice(source.indexOf('  function collect()'), source.indexOf('  function temporaryBackup()'));
  const setup = options => vm.runInNewContext(collect + '\ncollect()', {
    current:{data:{options, imageIds:[]}}, fields:{},
    $:id => ({value:({'fade-height':'180',tone:'음슴체',tension:'높게',dialogue:'보통'})[id]}),
  });
  assert.equal(setup({lengthMode:'custom', lengthRequest:'대사 유지'}).options.lengthRequest, '대사 유지');
  assert.equal(setup({length:2000}).options.lengthMode, 'source');
  assert.ok(!('length' in setup({length:2000}).options));
});
