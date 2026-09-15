/** Shared client/server schema. No credentials or unpublished after-content. */
export const VERSION = 1;
export const MAX_PAGES = 60;
export const MAX_BYTES = 12 * 1024 * 1024;
export const DEFAULT_STYLE = Object.freeze({height:1920,theme:'paper',layout:'text',fontSize:48,lineHeight:1.5,brandLine:'',footer:''});
export const THEMES = Object.freeze({
  paper:{paper:'#ffffff',ink:'#000000',muted:'#5d5d5d',accent:'#fd582b',line:'#ece8e4',footer:'#000000'},
  brand:{paper:'#fd582b',ink:'#000000',muted:'#3f251c',accent:'#000000',line:'#000000',footer:'#000000'}
});
export const normalizeText = text => String(text ?? '').replace(/\r\n?/g,'\n');
export async function sourceKey(source) {
  const raw=JSON.stringify([source.title,normalizeText(source.before)]);
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
function string(value,max,label) {
  if(typeof value!=='string'||value.length>max)throw new Error(`${label} 형식이나 길이를 확인해 주세요.`);
  return value;
}
/** Whitelist the import/server payload; never merge arbitrary imported properties. */
export function validateProject(raw) {
  if(!raw||raw.version!==VERSION||!raw.source||!raw.style||!Array.isArray(raw.pages))throw new Error('지원하는 썰판 작업파일이 아니에요.');
  const s=raw.style;
  if(![1350,1920].includes(s.height)||!Object.hasOwn(THEMES,s.theme)||!['text','photo'].includes(s.layout)||!Number.isFinite(s.fontSize)||s.fontSize<32||s.fontSize>64||!Number.isFinite(s.lineHeight)||s.lineHeight<1.3||s.lineHeight>1.8)throw new Error('스타일 설정을 확인해 주세요.');
  if(raw.pages.length<1||raw.pages.length>MAX_PAGES)throw new Error('본문 페이지 수를 확인해 주세요.');
  const assets={};
  for(const [key,value] of Object.entries(raw.assets||{})){
    if(!/^[a-zA-Z0-9_-]{1,80}$/.test(key)||typeof value!=='string'||value.length>2800000||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(value))throw new Error('작업파일의 이미지 형식을 확인해 주세요.');
    assets[key]=value;
  }
  if(Object.keys(assets).length>64)throw new Error('이미지가 너무 많아요.');
  const ref=v=>typeof v==='string'&&Object.hasOwn(assets,v)?v:'';
  const project={version:VERSION,
    source:{title:string(raw.source.title,160,'원고 제목'),before:string(raw.source.before,60000,'미리읽기')},
    style:{height:s.height,theme:s.theme,layout:s.layout,fontSize:s.fontSize,lineHeight:s.lineHeight,brandLine:string(s.brandLine??'',50,'상단 문구'),footer:string(s.footer??'',70,'하단 문구')},
    cover:{title:string(raw.cover?.title??'',200,'표지 제목'),subtitle:string(raw.cover?.subtitle??'',240,'표지 소개')},
    cta:{enabled:raw.cta?.enabled===true,title:string(raw.cta?.title??'',160,'마지막 제목'),subtitle:string(raw.cta?.subtitle??'',240,'마지막 안내'),button:string(raw.cta?.button??'',70,'마지막 버튼')},
    pages:raw.pages.map(p=>({text:string(p.text,60000,'카드 본문'),image:ref(p.image)})),
    assets,coverImage:ref(raw.coverImage),commonImage:ref(raw.commonImage),manual:raw.manual===true};
  if(project.pages.reduce((n,p)=>n+p.text.length,0)>120000)throw new Error('카드 본문이 너무 길어요.');
  if(new TextEncoder().encode(JSON.stringify(project)).length>MAX_BYTES)throw new Error('작업파일이 12MB를 넘어가요. 이미지 크기나 개수를 줄여 주세요.');
  return project;
}
