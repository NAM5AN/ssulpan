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
  const imageY=168, imageHeight=Math.round(style.height*.33);
  const top=style.layout==='photo'?imageY+imageHeight+38:184;
  return {left:76,width:928,top,bottom:style.height-178,imageY,imageHeight,line:style.fontSize*style.lineHeight};
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
export function cards(project){return [{type:'cover'},...project.pages.map((_,index)=>({type:'body',index})),...(project.cta.enabled?[{type:'end'}]:[])];}
function font(ctx,size,weight=500){ctx.font=`${weight} ${size}px "${FONT}", sans-serif`;}
function round(ctx,x,y,w,h,r=24){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
function photo(ctx,image,x,y,w,h){if(!image)return;const ratio=Math.max(w/image.width,h/image.height),dw=image.width*ratio,dh=image.height*ratio;ctx.save();round(ctx,x,y,w,h);ctx.clip();ctx.drawImage(image,x+(w-dw)/2,y+(h-dh)/2,dw,dh);ctx.restore();}
function block(ctx,text,x,y,width,height,size,weight=500,spacing=1.5){
  font(ctx,size,weight);const lineHeight=size*spacing, lines=wrapLines(text,width,t=>ctx.measureText(t).width);
  lines.forEach((line,i)=>{if((i+1)*lineHeight<=height+1)ctx.fillText(line,x,y+i*lineHeight);});
  return lines.length*lineHeight<=height+1;
}
/** Same rendering path for the large preview, thumbnails and exported PNGs. */
export function drawCard(canvas,project,card,number,total,images=new Map(),scale=1) {
  const h=project.style.height,p=THEMES[project.style.theme],g=geometry(project.style);
  canvas.width=Math.round(WIDTH*scale);canvas.height=Math.round(h*scale);
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('이 브라우저에서는 캔버스를 사용할 수 없어요.');
  ctx.scale(scale,scale);ctx.textBaseline='top';ctx.fillStyle=p.paper;ctx.fillRect(0,0,WIDTH,h);
  let errors=[];
  if(card.type==='cover'){
    const image=images.get(project.coverImage||project.commonImage);
    if(image){photo(ctx,image,22,450,1036,h-474);const fade=ctx.createLinearGradient(0,440,0,h*.78);fade.addColorStop(0,p.paper);fade.addColorStop(.55,p.paper+'dd');fade.addColorStop(1,p.paper+'00');ctx.fillStyle=fade;ctx.fillRect(22,438,1036,h-462);}
    else {ctx.fillStyle=p.accent+'55';ctx.save();ctx.translate(220,h*.65);ctx.rotate(-.11);round(ctx,-140,-60,950,150,50);ctx.fill();ctx.restore();}
  }
  ctx.strokeStyle=p.line;ctx.lineWidth=2;round(ctx,12,12,1056,h-24,28);ctx.stroke();
  ctx.fillStyle=p.ink;font(ctx,58,900);ctx.fillText('썰판',70,60);
  font(ctx,26,500);ctx.fillStyle=p.muted;if(ctx.measureText(project.style.brandLine).width>580)errors.push('상단 공통 문구가 너무 길어요.');ctx.save();ctx.beginPath();ctx.rect(225,76,590,42);ctx.clip();ctx.fillText(project.style.brandLine,225,82);ctx.restore();
  ctx.fillStyle=p.ink;font(ctx,30,700);ctx.textAlign='right';ctx.fillText(`${String(number).padStart(2,'0')} / ${String(total).padStart(2,'0')}`,1006,78);ctx.textAlign='left';
  if(card.type==='cover'){
    ctx.fillStyle=p.ink;
    if(!project.cover.title.trim())errors.push('표지 제목을 입력해 주세요.');
    const top=h===1350?230:330, titleHeight=h===1350?430:640;
    font(ctx,100,900);const titleLines=wrapLines(project.cover.title,928,t=>ctx.measureText(t).width);
    titleLines.forEach((line,i)=>{if((i+1)*120>titleHeight)return;if(i===titleLines.length-1){ctx.fillStyle=p.accent;round(ctx,68,top+i*120+78,Math.min(944,ctx.measureText(line).width+20),26,10);ctx.fill();ctx.fillStyle=p.ink;}ctx.fillText(line,76,top+i*120);});
    if(titleLines.length*120>titleHeight)errors.push('표지 제목이 넘쳐요. 제목을 줄이거나 줄바꿈을 조절해 주세요.');
    if(!block(ctx,project.cover.subtitle,78,top+titleHeight+40,920,h-(top+titleHeight+40)-220,42,500,1.5))errors.push('표지 소개가 넘쳐요.');
  }else if(card.type==='body'){
    if(project.style.layout==='photo'){
      const image=images.get(project.pages[card.index].image||project.commonImage);
      if(image)photo(ctx,image,g.left,g.imageY,g.width,g.imageHeight);
      else{ctx.fillStyle=p.line;round(ctx,g.left,g.imageY,g.width,g.imageHeight);ctx.fill();errors.push(`본문 ${card.index+1}장에 이미지를 넣거나 글 중심 형식을 선택해 주세요.`);}
    }
    ctx.fillStyle=p.ink;
    const text=project.pages[card.index].text;
    if(!text.trim())errors.push(`본문 ${card.index+1}장이 비어 있어요.`);
    if(!block(ctx,text,g.left,g.top,g.width,g.bottom-g.top,project.style.fontSize,500,project.style.lineHeight))errors.push(`본문 ${card.index+1}장이 넘쳐요. 다시 나누거나 직접 분할해 주세요.`);
  }else{
    const y=h===1350?345:610;
    ctx.fillStyle=p.accent;round(ctx,76,y-58,110,12,6);ctx.fill();ctx.fillStyle=p.ink;
    if(!project.cta.title.trim())errors.push('마지막 안내 제목을 입력해 주세요.');
    if(!block(ctx,project.cta.title,76,y,928,390,76,800,1.35))errors.push('마지막 안내 제목이 넘쳐요.');
    ctx.fillStyle=p.muted;if(!block(ctx,project.cta.subtitle,76,y+420,928,h-y-625,42,500,1.5))errors.push('마지막 안내 문구가 넘쳐요.');
  }
  const footer=card.type==='end'?project.cta.button:project.style.footer;
  ctx.fillStyle=p.footer;round(ctx,22,h-132,1036,110,20);ctx.fill();ctx.fillStyle='#ffffff';font(ctx,32,600);
  if(ctx.measureText(footer).width>825)errors.push('하단 문구가 너무 길어요.');
  ctx.save();ctx.beginPath();ctx.rect(64,h-100,836,70);ctx.clip();ctx.fillText(footer,68,h-94);ctx.restore();
  ctx.beginPath();ctx.arc(970,h-77,31,0,Math.PI*2);ctx.fill();ctx.strokeStyle=p.footer;ctx.lineWidth=6;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(964,h-88);ctx.lineTo(976,h-77);ctx.lineTo(964,h-66);ctx.stroke();
  canvas.setAttribute?.('aria-label',`${number}/${total} ${card.type==='cover'?'표지':card.type==='end'?'마지막 안내':'본문 '+(card.index+1)}`);
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
