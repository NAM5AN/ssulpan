const API='https://api.anthropic.com/v1/messages';

function cleanJson(text=''){
  const trimmed=text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  const first=trimmed.indexOf('{'),last=trimmed.lastIndexOf('}');
  if(first<0||last<first)throw new Error('Claude 응답에서 JSON을 찾지 못했습니다.');
  return JSON.parse(trimmed.slice(first,last+1));
}

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'POST only'});
  const key=process.env.ANTHROPIC_API_KEY;
  if(!key)return res.status(500).json({error:'ANTHROPIC_API_KEY가 설정되지 않았습니다.'});
  const model=process.env.ANTHROPIC_MODEL||'claude-sonnet-4-5';
  const body=req.body||{};
  const mode=body.mode==='rewrite'?'rewrite':'generate';
  const common=`당신은 한국 커뮤니티 썰 콘텐츠 편집자다. 과장된 보고서체 대신 실제 사람이 쓴 듯 자연스러운 한국어로 쓴다. 사실관계를 임의로 크게 바꾸지 말고, 입력에 없는 실명·회사명·범죄·질병 등 민감한 사실을 만들어내지 않는다. 독자의 궁금증을 유지하되 낚시성 거짓말은 만들지 않는다.`;
  let prompt;
  if(mode==='rewrite'){
    prompt=`${common}\n\n아래 한 구간만 다시 써라. 앞뒤 맥락과 인물 관계를 유지하고 사용자의 수정 요청을 우선한다.\n제목: ${body.title||''}\n카테고리: ${body.category||''}\n인물·사건 메모: ${body.memo||''}\n수정 요청: ${body.guide||'더 자연스럽고 몰입감 있게'}\n원문:\n${body.original||''}\n\n반드시 JSON 하나만 출력: {"text":"다시 쓴 본문"}`;
  }else{
    prompt=`${common}\n\n다음 소재를 썰판 게시글로 구성한다. 첫 구간은 광고/계속읽기 이전에 보이는 도입부, 두 번째 구간은 그 뒤에 이어지는 본문이다. 제목은 짧고 사건이 드러나게 한다. 태그는 별도의 후처리 없이 바로 저장할 수 있도록 5~10개를 자동 추출한다. 태그에는 # 기호를 넣지 말고 배열로 준다. 입력에 없는 카테고리를 새로 만들지 않는다.\n\n제목 초안: ${body.title||''}\n카테고리: ${body.category||'일상'}\n인물·사건 메모: ${body.memo||''}\n원본 소재:\n${body.seed||''}\n\n반드시 JSON 하나만 출력하고 다른 설명은 쓰지 마라. 형식:\n{"title":"제목","previewText":"도입부","afterText":"이어지는 본문","continueLine":"계속 읽기 직전 한 줄","tags":["태그1","태그2"]}`;
  }
  try{
    const r=await fetch(API,{method:'POST',headers:{'content-type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},body:JSON.stringify({model,max_tokens:3500,temperature:.8,messages:[{role:'user',content:prompt}]})});
    const data=await r.json();
    if(!r.ok)return res.status(r.status).json({error:data?.error?.message||'Claude API 호출 실패'});
    const text=(data.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');
    return res.status(200).json(cleanJson(text));
  }catch(err){
    return res.status(500).json({error:String(err?.message||err)});
  }
}
