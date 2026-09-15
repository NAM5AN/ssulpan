/** Shared, dependency-free pagination, Canvas renderer and ZIP writer.
 * The source contract contains only title + beforeContent. No after-content is read.
 */
import {DEFAULT_STYLE,THEMES,MAX_PAGES,normalizeText} from './studio-carousel-contract.mjs';
export {VERSION,DEFAULT_STYLE,THEMES,MAX_PAGES,MAX_BYTES,normalizeText,sourceKey,validateProject} from './studio-carousel-contract.mjs';
export const WIDTH=1080;
export const FONT='SseolpanCarousel';
export const BODY_FILL_RATIO=.62;
const SITE=Object.freeze({paper:'#ffffff',ink:'#000000',muted:'#5d5d5d',accent:'#fd582b',line:'#ece8e4'});
const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('ko',{granularity:'grapheme'}) : null;
export const graphemes = text => segmenter ? Array.from(segmenter.segment(text),v=>v.segment) : Array.from(text);
export function geometry(style) {
  const imageY=190, imageHeight=Math.round(style.height*.30);
  const top=style.layout==='photo'?imageY+imageHeight+44:220;
  return {left:76,width:928,top,bottom:style.height-120,imageY,imageHeight,line:style.fontSize*style.lineHeight};
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
export function bodyTextHeight(style){const g=geometry(style);return Math.floor((g.bottom-g.top)*BODY_FILL_RATIO);}
export function textFits(text,style,measure) {
  const g=geometry(style), max=Math.max(1,Math.floor(bodyTextHeight(style)/g.line));
  return wrapLines(text,g.width,measure,max).length<=max;
}
function preferredCut(text,limit) {
  const prefix=text.slice(0,limit), floor=Math.floor(limit*.58);
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
    let cut=preferredCut(rest,chars.slice(0,best).join('').length);
    if(!rest.slice(0,cut).trim())cut=chars.slice(0,best).join('').length;
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
/** The existing studio already renders the Instagram cover, so this maker exports body + optional CTA only. */
export function cards(project){return [...project.pages.map((_,index)=>({type:'body',index})),...(project.cta.enabled?[{type:'end'}]:[])];}
function font(ctx,size,weight=500){ctx.font=`${weight} ${size}px "${FONT}", sans-serif`;}
function round(ctx,x,y,w,h,r=24){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
function photo(ctx,image,x,y,w,h){if(!image)return;const ratio=Math.max(w/image.width,h/image.height),dw=image.width*ratio,dh=image.height*ratio;ctx.save();round(ctx,x,y,w,h,18);ctx.clip();ctx.drawImage(image,x+(w-dw)/2,y+(h-dh)/2,dw,dh);ctx.restore();}
function block(ctx,text,x,y,width,height,size,weight=500,spacing=1.5){
  font(ctx,size,weight);const lineHeight=size*spacing, lines=wrapLines(text,width,t=>ctx.measureText(t).width);
  lines.forEach((line,i)=>{if((i+1)*lineHeight<=height+1)ctx.fillText(line,x,y+i*lineHeight);});
  return lines.length*lineHeight<=height+1;
}
function header(ctx,h){
  ctx.fillStyle=SITE.ink;font(ctx,60,900);ctx.fillText('썰판',70,56);
  ctx.fillStyle=SITE.accent;round(ctx,70,136,164,12,6);ctx.fill();
  ctx.strokeStyle=SITE.line;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(70,168);ctx.lineTo(1010,168);ctx.stroke();
}
/** Same rendering path for the large preview, thumbnails and exported PNGs. */
export function drawCard(canvas,project,card,number,total,images=new Map(),scale=1) {
  const h=project.style.height,g=geometry(project.style);
  canvas.width=Math.round(WIDTH*scale);canvas.height=Math.round(h*scale);
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('이 브라우저에서는 캔버스를 사용할 수 없어요.');
  ctx.scale(scale,scale);ctx.textBaseline='top';let errors=[];
  if(card.type==='end'){
    ctx.fillStyle=SITE.accent;ctx.fillRect(0,0,WIDTH,h);ctx.fillStyle=SITE.ink;font(ctx,60,900);ctx.fillText('썰판',70,56);
    const buttonH=118,buttonY=h-(h===1350?240:330),promptY=buttonY-(h===1350?210:250);
    const prompt=(project.cta.title||'이야기는 여기서 계속됩니다').replace(/\n+/g,' ').trim();
    ctx.fillStyle=SITE.ink;if(!block(ctx,prompt,76,promptY,928,170,h===1350?54:64,800,1.32))errors.push('버튼 위 유도 문구가 너무 길어요.');
    const button=(project.cta.button||'전체 이야기 보기').trim();
    ctx.fillStyle=SITE.ink;round(ctx,76,buttonY,928,buttonH,18);ctx.fill();ctx.fillStyle='#ffffff';font(ctx,h===1350?34:38,750);
    if(ctx.measureText(button).width>820)errors.push('마지막 버튼 문구가 너무 길어요.');
    ctx.textAlign='center';ctx.fillText(button,540,buttonY+(buttonH-(h===1350?34:38))/2-2);ctx.textAlign='left';
    canvas.setAttribute?.('aria-label','마지막 안내');return errors;
  }
  ctx.fillStyle=SITE.paper;ctx.fillRect(0,0,WIDTH,h);header(ctx,h);
  if(project.style.layout==='photo'){
    const image=images.get(project.pages[card.index].image||project.commonImage);
    if(image)photo(ctx,image,g.left,g.imageY,g.width,g.imageHeight);
    else{ctx.fillStyle='#f4f4f4';round(ctx,g.left,g.imageY,g.width,g.imageHeight,18);ctx.fill();errors.push(`본문 ${card.index+1}장에 이미지를 넣거나 글 중심 형식을 선택해 주세요.`);}
  }
  ctx.fillStyle=SITE.ink;const text=project.pages[card.index].text;
  if(!text.trim())errors.push(`본문 ${card.index+1}장이 비어 있어요.`);
  if(!block(ctx,text,g.left,g.top,g.width,bodyTextHeight(project.style),project.style.fontSize,500,project.style.lineHeight))errors.push(`본문 ${card.index+1}장 분량이 많아요. 다시 나누거나 직접 분할해 주세요.`);
  canvas.setAttribute?.('aria-label',`본문 ${card.index+1}`);return errors;
}
export function fileName(card,index){return `${String(index+1).padStart(2,'0')}_${card.type==='end'?'end':'body'}.png`;}
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
