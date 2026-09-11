import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {renderHome,renderStory,storyUrl,dbId} from '../dist/ssul-render.mjs';
import T from '../dist/ssul-templates.mjs';
import source from '../dist/ssul-source-data.mjs';
import worker from '../dist/_worker.js';
const rows=source.originals.map((p,i)=>({...p,date:`2026-09-${String(10-i).padStart(2,'0')}`,tags:['테스트']}));
test('11 original CSS, JS, logo, images remain byte-identical',()=>{
 const report=JSON.parse(fs.readFileSync('dist/ui-provenance.json'));
 assert.equal(report.assets.length,11);
 for(const asset of report.assets)assert.equal(crypto.createHash('sha256').update(fs.readFileSync('dist/'+asset.path)).digest('hex'),asset.sha256,asset.path);
});
test('source templates retain original public UI classes, never reconstructed main CSS',()=>{
 const h=renderHome(rows,new URL('https://ssulpan.test/'));
 for(const text of ['community-head','community-brand','/brand/ssulpan-logo.png','/style.css','/community.css','/community.js','/community/office.png'])assert.ok(h.includes(text),text);
 assert.equal((h.match(/class="story-row"/g)||[]).length,6);
 assert.ok(!h.includes('/styles.css'));assert.ok(!h.includes('/app.js'));assert.ok(!h.includes('__CF$cv$params'));
});
test('original list/card, category, keyword, order and pagination bindings',()=>{
 const home=path=>renderHome(rows,new URL('https://ssulpan.test'+path));
 assert.equal((home('/?category=직장생활').match(/class="story-row"/g)||[]).length,2);
 assert.equal((home('/?q=결혼식').match(/class="story-row"/g)||[]).length,1);
 assert.equal((home('/?view=cards').match(/data-story-thumbnail/g)||[]).length,6);
 assert.ok(home('/?view=cards').includes('/thumbnails.js'));
 assert.ok(home('/?order=oldest').indexOf('class="story-row" href="/stories/006/')>0);
});
test('all six original complete articles and continue-reading DOM survive',()=>{
 for(const p of rows){const h=renderStory(p,rows);assert.ok(h.includes('id="continue-reading"'));assert.ok(h.includes('id="continuation" hidden'));assert.ok(h.includes('rel="prev"'));assert.ok(h.includes('rel="next"'));assert.ok(h.includes('이야기 끝'));assert.ok(h.includes(p.afterContent.split('\n\n').at(-1)));}
 assert.equal(dbId('001'),'1');assert.equal(storyUrl('1'),'/stories/001/');assert.equal(storyUrl('draft-abc'),'/stories/draft-abc/');
});
test('stored article text cannot inject HTML',()=>{const h=renderStory({...rows[0],title:'<img src=x onerror=alert(1)>',beforeContent:'<script>alert(1)</script>'},rows);assert.ok(h.includes('&lt;script&gt;'));assert.ok(!h.includes('<img src=x'));});
test('canonical recovered sample content via compatibility API without overwriting new edits',async()=>{
 const saved=globalThis.fetch;
 try {
  globalThis.fetch=async()=>Response.json({ok:true,posts:source.previousSeeds});
  const response=await worker.fetch(new Request('https://ssulpan.test/api/ssul_posts'),{}),result=await response.json();
  assert.equal(result.posts[0].beforeContent,source.originals[0].beforeContent);
  globalThis.fetch=async()=>Response.json({ok:true,posts:[{...source.previousSeeds[0],beforeContent:'새로 작성한 내용'}]});
  const changed=await worker.fetch(new Request('https://ssulpan.test/api/ssul_posts'),{});
  assert.equal((await changed.json()).posts[0].beforeContent,'새로 작성한 내용');
 } finally {globalThis.fetch=saved;}
});
