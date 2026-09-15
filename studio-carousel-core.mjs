/** Shared, dependency-free pagination, Canvas renderer and ZIP writer.
 * The source contract contains only title + beforeContent. No after-content is read.
 */
import {DEFAULT_STYLE,THEMES,MAX_PAGES,normalizeText} from './studio-carousel-contract.mjs';
export {VERSION,DEFAULT_STYLE,THEMES,MAX_PAGES,MAX_BYTES,normalizeText,sourceKey,validateProject} from './studio-carousel-contract.mjs';
export const WIDTH=1080;
export const FONT='SseolpanCarousel';
const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('ko',{granularity:'grapheme'}) : null;
export const graphemes = text => segmenter ? Array.from(segmenter.segment(text),v=>v.segment) : Array.from(text);
export function geometry(style) {
  const h=style.height||1920;
  const imageY=h===1350?215:250, imageHeight=h===1350?300:420;
  const top=style.layout==='photo'?imageY+imageHeight+(h===1350?38:50):(h===1350?245:300);
  const bottom=h===1350?1035:1385;
  return {left:86,width:908,top,bottom,imageY,imageHeight,line:style.fontSize*style.lineHeight};
}
export function wrapLines(text,width,measure,maxLines=Infinity) {
  const result=[];let line='';
  for (const ch of graphemes(text.trim())) {
    if(ch==='\n'){result.push(line);line='';}
    else if(line && measure(line+ch)>width){result.push(line);line=ch;}
    else line+=ch;
    if(result.length>maxLines)return result;
  }
  if(line || !result.length)result.push(line);
  return result;
}
export function textFits(text,style,measure) {
  const g=geometry(style), max=Math.floor((g.bottom-g.top)/g.line);
  return wrapLines(text,g.width,measure,max).length<=max;
}
function preferredCut(text,limit) {
  const prefix=text.slice(0,limit), floor=Math.floor(limit*.52);
  for(const pattern of [/\n[ \t]*\n+/g,/\n/g,/[.!?。！？][”"'’)]*(?:[ \t]+|$)/g,/[ \t]+/g]) {
    const candidates=Array.from(prefix.matchAll(pattern),m=>m.index+m[0].length).filter(n=>n>=floor&&n<text.length&&text.slice(0,n).trim()&&text.slice(n).trim());
    if(candidates.length)return candidates.at(-1);
  }
  return limit;
}
/** Exact source preservation: returned pages join to the unmodified source. */
export function paginate(text,style,measure,requested=0) {
  text=normalizeText(text);
  if(!text.trim())throw new Error('광고 전 공개 내용을 먼저 작성해 주세요.');
  if(text.length>60000)throw new Error('한 번에 나눌 수 있는 본문은 60,000자까지예요.');
  const pages=[]; let rest=text;
  while(rest.length) {
    if(textFits(rest,style,measure)){pages.push(rest);break;}
    const chars=graphemes(rest);let low=1,high=chars.length,best=0;
    while(low<=high){const mid=(low+high)>>1, sample=chars.slice(0,mid).join('');if(textFits(sample,style,measure)){best=mid;low=mid+1;}else high=mid-1;}
    if(!best)throw new Error('선택한 글자 크기로는 한 줄도 들어가지 않아요.');
    const safeBest=Math.max(1,Math.floor(best*.82));
    let cut=preferredCut(rest,chars.slice(0,safeBest).join('').length);
    if(!rest.slice(0,cut).trim())cut=chars.slice(0,safeBest).join('').length;
    pages.push(rest.slice(0,cut));rest=rest.slice(cut);
    if(pages.length>=MAX_PAGES)throw new Error('본문이 60장을 넘어가요. 미리읽기를 줄이거나 글자 크기를 조절해 주세요. 내용을 자르지 않았어요.');
  }
  requested=Number(requested)||0;
  if(requested && (!Number.isInteger(requested)||requested<1||requested>MAX_PAGES))throw new Error('본문 장 수는 1~60 사이여야 해요.');
  if(requested && requested<pages.length)throw new Error(`현재 설정에서는 본문이 최소 ${pages.length}장 필요해요. 장 수를 늘리거나 글자 크기를 조절해 주세요.`);
  while(requested>pages.length) {
    let choice=-1,cut=0,largest=0;
    pages.forEach((page,i)=>{
      if(page.trim().length<=largest)return;
      const chars=graphemes(page), middle=chars.slice(0,Math.ceil(chars.length/2)).join('').length;
      let at=preferredCut(page,middle);
      if(!page.slice(0,at).trim()||!page.slice(at).trim())at=middle;
      if(page.slice(0,at).trim()&&page.slice(at).trim()){choice=i;cut=at;largest=page.trim().length;}
    });
    if(choice<0)throw new Error('내용이 짧아서 요청한 장 수로 나눌 수 없어요.');
    const value=pages[choice];pages.splice(choice,1,value.slice(0,cut),value.slice(cut));
  }
  return pages;
}
export function cards(project){return [{type:'cover'},...project.pages.map((_,index)=>({type:'body',index})),...(project.cta.enabled?[{type:'end'}]:[])];}
function font(ctx,size,weight=500){ctx.font=`${weight} ${size}px "${FONT}", sans-serif`;}
function round(ctx,x,y,w,h,r=24){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
function photo(ctx,image,x,y,w,h){if(!image)return;const ratio=Math.max(w/image.width,h/image.height),dw=image.width*ratio,dh=image.height*ratio;ctx.save();round(ctx,x,y,w,h,18);ctx.clip();ctx.drawImage(image,x+(w-dw)/2,y+(h-dh)/2,dw,dh);ctx.restore();}
function block(ctx,text,x,y,width,height,size,weight=500,spacing=1.5){
  font(ctx,size,weight);const lineHeight=size*spacing, lines=wrapLines(text,width,t=>ctx.measureText(t).width);
  lines.forEach((line,i)=>{if((i+1)*lineHeight<=height+1)ctx.fillText(line,x,y+i*lineHeight);});
  return lines.length*lineHeight<=height+1;
}
function bodyShell(ctx,h,p){
  ctx.fillStyle=p.paper;ctx.fillRect(0,0,WIDTH,h);
  ctx.fillStyle='#fd582b';ctx.fillRect(0,0,WIDTH,h===1350?160:190);
  ctx.fillStyle='#111111';font(ctx,h===1350?54:62,900);ctx.fillText('썰판',76,h===1350?48:58);
  ctx.fillRect(0,h===1350?157:187,WIDTH,3);
}
/** Same rendering path for body/end previews and exported PNGs. Cover is normally copied from the existing studio cover canvas. */
export function drawCard(canvas,project,card,number,total,images=new Map(),scale=1) {
  const h=project.style.height,p=THEMES[project.style.theme]||THEMES.site,g=geometry(project.style);
  canvas.width=Math.round(WIDTH*scale);canvas.height=Math.round(h*scale);
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('이 브라우저에서는 캔버스를 사용할 수 없어요.');
  ctx.scale(scale,scale);ctx.textBaseline='top';let errors=[];
  if(card.type==='cover'){
    ctx.fillStyle='#fd582b';ctx.fillRect(0,0,WIDTH,h);ctx.fillStyle='#000';font(ctx,64,900);ctx.fillText('썰판',76,64);
    const top=h===1350?300:500;ctx.fillStyle='#000';
    if(!project.cover.title.trim())errors.push('기존 인스타 표지 제목을 입력해 주세요.');
    if(!block(ctx,project.cover.title,76,top,928,h-top-250,h===1350?82:104,850,1.22))errors.push('기존 표지 제목이 넘쳐요.');
  }else if(card.type==='body'){
    bodyShell(ctx,h,p);
    if(project.style.layout==='photo'){
      const image=images.get(project.pages[card.index].image||project.commonImage);
      if(image)photo(ctx,image,g.left,g.imageY,g.width,g.imageHeight);
      else{ctx.fillStyle='#f1eee9';round(ctx,g.left,g.imageY,g.width,g.imageHeight,18);ctx.fill();errors.push(`본문 ${card.index+1}장에 이미지를 넣거나 글 중심 형식을 선택해 주세요.`);}
    }
    ctx.fillStyle='#111111';const text=project.pages[card.index].text;
    if(!text.trim())errors.push(`본문 ${card.index+1}장이 비어 있어요.`);
    if(!block(ctx,text,g.left,g.top,g.width,g.bottom-g.top,project.style.fontSize,500,project.style.lineHeight))errors.push(`본문 ${card.index+1}장이 넘쳐요. 한 장에 너무 많은 글을 넣지 않도록 다시 나눠 주세요.`);
  }else{
    ctx.fillStyle='#fd582b';ctx.fillRect(0,0,WIDTH,h);ctx.fillStyle='#111111';font(ctx,h===1350?54:62,900);ctx.fillText('썰판',76,h===1350?48:58);
    const buttonH=h===1350?126:150,buttonY=h===1350?940:1390;
    const guideY=buttonY-(h===1350?250:300);
    if(!project.cta.title.trim())errors.push('마지막 유도 문구를 입력해 주세요.');
    ctx.fillStyle='#111111';if(!block(ctx,project.cta.title,76,guideY,928,210,h===1350?58:70,800,1.35))errors.push('마지막 유도 문구가 넘쳐요.');
    const label=project.cta.button||'전체 이야기 보기';
    ctx.fillStyle='#111111';round(ctx,76,buttonY,928,buttonH,22);ctx.fill();ctx.fillStyle='#ffffff';font(ctx,h===1350?35:40,700);
    const labelW=ctx.measureText(label).width;if(labelW>820)errors.push('마지막 버튼 문구가 너무 길어요.');
    ctx.fillText(label,76+(928-labelW)/2,buttonY+(buttonH-(h===1350?35:40))/2-4);
  }
  canvas.setAttribute?.('aria-label',card.type==='cover'?'기존 썰판 표지':card.type==='end'?'마지막 안내':`본문 ${card.index+1}`);
  return errors;
}
export function fileName(card,index){return `${String(index+1).padStart(2,'0')}_${card.type==='cover'?'cover':card.type==='end'?'end':'body'}.png`;}
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let j=0;j<8;j++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
export function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
/** ZIP STORE is intentional: PNG/JPEG are already compressed. Supports UTF-8 names. */
export function makeZip(entries) {
  const body=[],directory=[];let offset=0,centralSize=0;
  for(const entry of entries){
    const name=new TextEncoder().encode(entry.name),data=entry.data instanceof Uint8Array?entry.data:new Uint8Array(entry.data),crc=crc32(data);
    if(name.length>65535||data.length>0xffffffff)throw new Error('ZIP 파일이 너무 커요.');
    const header=new Uint8Array(30),v=new DataView(header.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);
    body.push(header,name,data);
    const central=new Uint8Array(46),c=new DataView(central.buffer);c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);c.setUint16(14,33,true);c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,name.length,true);c.setUint32(42,offset,true);
    directory.push(central,name);centralSize+=central.length+name.length;offset+=header.length+name.length+data.length;
  }
  const end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,entries.length,true);e.setUint16(10,entries.length,true);e.setUint32(12,centralSize,true);e.setUint32(16,offset,true);
  return new Blob([...body,...directory,end],{type:'application/zip'});
}
