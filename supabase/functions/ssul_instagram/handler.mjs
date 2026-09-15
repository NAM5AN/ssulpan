import {MAX_BYTES,validateProject,sourceKey} from '../../../studio-carousel-contract.mjs';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
class Fault extends Error{constructor(status,message){super(message);this.status=status;}}
export async function boundedJson(request,limit=MAX_BYTES+4096){
  const announced=Number(request.headers.get('Content-Length'));
  if(announced>limit)throw new Fault(413,'작업파일 용량이 너무 커요.');
  if(!request.body)throw new Fault(400,'요청 내용이 없어요.');
  const reader=request.body.getReader(),chunks=[];let total=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>limit){await reader.cancel();throw new Fault(413,'작업파일 용량이 너무 커요.');}chunks.push(value);}}finally{reader.releaseLock();}
  const merged=new Uint8Array(total);let offset=0;for(const chunk of chunks){merged.set(chunk,offset);offset+=chunk.length;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(merged));}catch{throw new Fault(400,'JSON 작업파일 형식을 확인해 주세요.');}
}
/** Uses the existing studio session verifier BEFORE any service-role DB access. */
export function createHandler({url,publicKey,serviceKey,fetcher=fetch}){
  const dbHeaders={'apikey':serviceKey,'Content-Type':'application/json',...(!serviceKey?.startsWith('sb_secret_')?{Authorization:'Bearer '+serviceKey}:{})};
  return async request=>{
    try{
      if(request.method!=='POST')return json({error:'POST 요청만 지원합니다.'},405);
      const b=await boundedJson(request);
      if(!b||!/^v1\.\d{13}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{24}\.[A-Za-z0-9_-]{43}$/.test(b.studioSession||''))throw new Fault(401,'제작실 로그인이 필요해요.');
      if(!url||!publicKey||!serviceKey)throw new Fault(503,'서버 저장 환경을 확인해 주세요.');
      const auth=await fetcher(url+'/functions/v1/ssul_studio',{method:'POST',headers:{apikey:publicKey,'Content-Type':'application/json'},body:JSON.stringify({action:'studio_access_verify',token:b.studioSession}),signal:AbortSignal.timeout(15000)});
      const proof=await auth.json().catch(()=>null);
      if(!auth.ok||proof?.ok!==true||proof?.authenticated!==true)throw new Fault(401,'제작실 세션이 만료됐어요. 다시 접속해 주세요.');
      if(!/^[a-f0-9]{64}$/.test(b.key||''))throw new Fault(400,'저장 주소 형식을 확인해 주세요.');
      if(b.action==='get'){
        const response=await fetcher(url+'/rest/v1/ssul_instagram_decks?key=eq.'+b.key+'&select=key,revision,data,updated_at&limit=1',{headers:dbHeaders,signal:AbortSignal.timeout(15000)});
        if(!response.ok)throw new Fault(503,'서버 저장본을 읽지 못했어요.');
        const rows=await response.json();if(!rows.length)return json({notFound:true},404);
        return json(rows[0]);
      }
      if(b.action==='put'){
        if(!Number.isInteger(b.revision)||b.revision<0||b.revision>2147483646)throw new Fault(400,'저장 버전을 확인해 주세요.');
        let data;try{data=validateProject(b.data);}catch(error){throw new Fault(400,error.message);}
        if(await sourceKey(data.source)!==b.key)throw new Fault(400,'원고 범위와 저장 주소가 일치하지 않아요.');
        const response=await fetcher(url+'/rest/v1/rpc/ssul_instagram_save_v1',{method:'POST',headers:dbHeaders,body:JSON.stringify({p_key:b.key,p_data:data,p_expected:b.revision}),signal:AbortSignal.timeout(15000)});
        const result=await response.json().catch(()=>null);
        if(result?.code==='40001')throw new Fault(409,'다른 기기에서 수정됐어요. 저장본을 다시 확인해 주세요.');
        if(!response.ok||!Array.isArray(result)||!result[0])throw new Fault(503,'서버 저장에 실패했어요. 기기 저장본은 유지됩니다.');
        return json(result[0]);
      }
      throw new Fault(400,'지원하지 않는 저장 요청이에요.');
    }catch(error){return json({error:error instanceof Fault?error.message:'서버 연결을 확인해 주세요.'},error instanceof Fault?error.status:503);}
  };
}
