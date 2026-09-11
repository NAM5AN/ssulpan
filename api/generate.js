const API='https://api.anthropic.com/v1/messages';

function cleanJson(text=''){
  const trimmed=String(text).trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  const first=trimmed.indexOf('{'),last=trimmed.lastIndexOf('}');
  if(first<0||last<first)throw new Error('Claude 응답에서 JSON을 찾지 못했습니다.');
  return JSON.parse(trimmed.slice(first,last+1));
}
function value(v,f=''){return v==null?f:String(v)}
function fullPrompt(body){
  const o=body.options||{};
  return `당신은 이야기 사이트 '썰판'의 원고 작가다. 사용자가 소재와 작성 조건을 전달하면 사이트 본문과 인스타그램 게시물 문구를 한 번의 응답으로 완성한다.

[입력 우선순위]
rewriteInstruction > notes > options > 일반 문체 규칙.
말투: ${value(o.tone,'친구에게 말하듯')}
전체 목표 분량: ${value(o.length,'2000')}자 안팎
긴장감: ${value(o.tension,'보통')}
대화 비중: ${value(o.dialogue,'보통')}

[현재 값]
제목: ${value(body.title)}
카테고리: ${value(body.category,'일상')}
사용자 작성 요청: ${value(body.notes)}
인물·사건 설정(storyBible): ${value(body.storyBible)}
참고할 소재:
${value(body.sourceText)}

[문체와 구성]
- 누군가 자기가 겪은 일을 친구에게 이야기하는 듯한 자연스러운 1인칭 구어체.
- 첫 문장에서 사건이나 이상한 상황이 이미 시작되게 하고 배경 설명이나 자기소개로 열지 않는다.
- 감정은 이름 붙이지 말고 행동, 대사, 반응으로 보여준다.
- 사람의 실제 대화처럼 끊기고 줄고 되묻는 대사를 쓴다.
- 짧은 문장과 긴 문장을 섞고 반복 설명, 억지 교훈, 상투적 감탄, 불필요한 소제목은 줄인다.
- 실명, 실제 상호, 특정 가능한 학교·지역은 가상의 표현으로 바꾼다.
- 참고 소재의 문장과 사건 순서를 그대로 바꿔쓰기 하지 말고 상황의 뼈대와 핵심 반전만 가져와 장면을 새로 설계한다.
- storyBible이 있으면 인물 관계와 시간 순서를 반드시 유지한다.

[광고 전후 본문]
전체를 하나의 이야기로 설계한 뒤 beforeContent와 afterContent로 나눈다.
beforeContent는 인물과 상황을 이해할 수 있고 다음이 궁금해지는 지점까지 보여준다.
afterContent는 앞부분 마지막 장면에서 바로 이어지고 핵심 사건과 결말을 완성한다. 앞부분을 요약하며 다시 시작하지 않는다.
두 부분에 같은 설명이나 장면을 반복하지 않는다.
beforeContent는 전체의 약 35~60%를 참고하되 자연스러운 끊김을 우선한다.
gateLine은 끊기는 장면의 구체적인 궁금증을 짚되 결말을 미리 알려주지 않는 한 줄이다.

[인스타그램]
1080×1920 표지를 전제로 한다.
hook은 큰 표지 제목이며 의미 단위로 3~4줄, 한 줄 약 10자 안팎. 줄바꿈은 \\n.
coverDetail은 본문에서 고른 40자 이내의 인상적인 대사/문장.
caption은 상황 소개 + 독자의 의견을 묻는 질문 1개 + 프로필 링크 안내.
hashtags는 #썰판, #썰, 이야기 소재 태그 3개로 총 5개.
제목, hook, coverDetail, teaser에는 본문에 실제로 없는 사건이나 대사를 넣지 않는다.

[결과]
반드시 아래 JSON 하나만 출력하고 다른 설명은 쓰지 않는다.
{
 "title":"최종 제목",
 "titles":["제목 후보1","제목 후보2","제목 후보3"],
 "category":"${value(body.category,'일상')}",
 "teaser":"목록용 짧은 소개",
 "beforeContent":"광고 전 본문",
 "afterContent":"광고 후 본문",
 "storyBible":"인물 관계·사건 순서·유지할 설정",
 "gateLine":"이어 읽기 문구",
 "hook":"3~4줄 표지 제목",
 "coverDetail":"표지 하단 문장",
 "caption":"인스타그램 캡션",
 "hashtags":["#썰판","#썰","#태그3","#태그4","#태그5"],
 "imageText":""
}

내보내기 전에 인물 관계, 시간 순서, 행동 동기, before/after 연결, 중복 설명, 제목과 본문의 일치, 목표 글자 수를 자체 점검하고 어긋난 부분을 고친 뒤 결과만 출력한다.`;
}
function promptFor(body){
  const mode=body.mode||'generate';
  const o=body.options||{};
  if(mode==='rewrite'){
    return `당신은 한국 커뮤니티 썰 편집자다.
전체 맥락을 읽고 사용자가 요청한 한 구간만 다시 쓴다. 요청과 무관한 부분은 건드리지 않는다.
제목: ${value(body.title)}
카테고리: ${value(body.category)}
인물·사건 설정: ${value(body.storyBible)}
말투: ${value(o.tone,'친구에게 말하듯')}
수정 요청: ${value(body.rewriteInstruction,'더 자연스럽고 몰입감 있게')}
광고 전 전체: ${value(body.beforeContent)}
광고 후 전체: ${value(body.afterContent)}
수정 대상 구간(${value(body.section)}):
${value(body.original)}
반드시 JSON 하나만 출력: {"text":"수정한 대상 구간만"}`;
  }
  if(mode==='review'){
    return `아래 썰 원고의 광고 전/후 연결만 점검한다. 새 원고를 쓰지 말고 인물 관계, 시간 순서, 중복 설명, 끊김 지점이 어색한지 간결하게 알려라.
제목: ${value(body.title)}
storyBible: ${value(body.storyBible)}
beforeContent:
${value(body.beforeContent)}
afterContent:
${value(body.afterContent)}
반드시 JSON 하나만 출력: {"message":"문제 없으면 그 사실을, 있으면 고쳐야 할 지점을 3문장 이내로"}`;
  }
  if(mode==='break'){
    return `아래 하나의 썰에서 광고 전후를 끊는 현재 위치가 자연스러운지 보고, 독자가 다음을 궁금해할 짧은 이어 읽기 문구를 추천한다. 결말을 스포일러하지 않는다.
제목: ${value(body.title)}
beforeContent:
${value(body.beforeContent)}
afterContent:
${value(body.afterContent)}
현재 gateLine: ${value(body.gateLine)}
반드시 JSON 하나만 출력: {"gateLine":"추천 문구","message":"왜 이 끊김이 자연스러운지 또는 어디를 조정하면 좋은지 2문장 이내"}`;
  }
  return fullPrompt(body);
}

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'POST only'});
  const key=process.env.ANTHROPIC_API_KEY;
  if(!key)return res.status(500).json({error:'ANTHROPIC_API_KEY가 설정되지 않았습니다.'});
  const model=process.env.ANTHROPIC_MODEL||'claude-sonnet-4-5';
  try{
    const r=await fetch(API,{
      method:'POST',
      headers:{'content-type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},
      body:JSON.stringify({
        model,max_tokens:5200,temperature:.8,
        messages:[{role:'user',content:promptFor(req.body||{})}]
      })
    });
    const data=await r.json();
    if(!r.ok)return res.status(r.status).json({error:data?.error?.message||'Claude API 호출 실패'});
    const text=(data.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');
    return res.status(200).json(cleanJson(text));
  }catch(err){
    return res.status(500).json({error:String(err?.message||err)});
  }
}
