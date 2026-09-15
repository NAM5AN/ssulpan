// Called only from studioApi, after the original Worker has verified the session
// and same-origin writes. The Edge Function verifies the session again.
const endpoint='https://wvwoqqfizgbhvdzlqscc.supabase.co/functions/v1/ssul_instagram';
const publishable='sb_publishable_iLtSrF52sRfzalwcR4Nt-w_dJiU2q16';
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
export async function instagramApi(request,path,session){
  const match=path.match(/^\/api\/instagram-decks\/([a-f0-9]{64})$/);
  if(!match)return new Response(JSON.stringify({error:'저장 주소를 확인해 주세요.'}),{status:400,headers});
  if(!['GET','PUT'].includes(request.method))return new Response(JSON.stringify({error:'GET 또는 PUT 요청만 지원합니다.'}),{status:405,headers:{...headers,Allow:'GET, PUT'}});
  if(!session)return new Response(JSON.stringify({error:'제작실 로그인이 필요해요.'}),{status:401,headers});
  const payload={action:request.method==='GET'?'get':'put',key:match[1],studioSession:session};
  if(request.method==='PUT'){
    const limit=12*1024*1024+4096;if(Number(request.headers.get('Content-Length'))>limit)return new Response(JSON.stringify({error:'작업파일은 12MB 이하여야 해요.'}),{status:413,headers});
    const reader=request.body?.getReader();if(!reader)return new Response(JSON.stringify({error:'요청 내용이 없어요.'}),{status:400,headers});
    let total=0,chunks=[];
    try{while(true){const {value,done}=await reader.read();if(done)break;total+=value.length;if(total>limit){await reader.cancel();return new Response(JSON.stringify({error:'작업파일은 12MB 이하여야 해요.'}),{status:413,headers});}chunks.push(value);}}finally{reader.releaseLock();}
    const bytes=new Uint8Array(total);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}
    try{const b=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));payload.data=b.data;payload.revision=b.revision;}catch{return new Response(JSON.stringify({error:'요청 형식을 확인해 주세요.'}),{status:400,headers});}
  }
  try{const result=await fetch(endpoint,{method:'POST',headers:{apikey:publishable,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(25000)});return new Response(await result.text(),{status:result.status,headers});}catch{return new Response(JSON.stringify({error:'서버 저장 연결이 지연돼요. 기기 저장본은 유지됩니다.'}),{status:503,headers});}
}
