import {GENERATION_RELEASE,strictSchema,completeMetadata,fieldReport,failureInfo,safeMessage} from "./generation-support.mjs";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { socialIssues, buildSocialRepairRequest, applySocialRepair, SOCIAL_FIELDS } from "./social-repair.mjs";
import { createSourceBaseline, inspectSourcePreservation } from "./source-preservation.mjs";
import {
  HttpError,
  id,
  cleanDraft,
  publicPost,
  assertPublish,
  DEFAULT_MODEL,
  promptFor,
  parseToolOutput,
  validateResult,
  string,
  masterPrompt,
  schemas,
} from "./core.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SERVER_ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const OWNER_ID = "00000000-0000-0000-0000-000000000001";
const IMAGE_BUCKET = "ssul_private";
const ARTIFACT_BUCKET = "ssul_studio_artifacts";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function fail(status: number, message: string): never {
  throw new HttpError(status, message);
}

function postToDraft(p: any) {
  return cleanDraft({
    id: String(p.id),
    title: p.title,
    category: p.category,
    teaser: p.teaser,
    beforeContent: p.before_content,
    afterContent: p.after_content,
    storyBible: p.story_bible,
    gateLine: p.gate_line,
    hook: p.hook,
    coverDetail: p.cover_detail,
    caption: p.caption,
    hashtags: Array.isArray(p.hashtags) ? p.hashtags.join(" ") : "",
    titles: p.titles || [],
    fadeHeight: p.fade_height || 180,
    imageIds: Array.isArray(p.source_image_paths) ? p.source_image_paths : [],
  });
}

function postRow(draftId: string, d: any) {
  const hashtags = String(d.hashtags || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((tag: string) => (tag.startsWith("#") ? tag : `#${tag}`));
  const tags = [...new Set(hashtags.map((tag: string) => tag.replace(/^#/, "")))];
  return {
    id: draftId,
    status: "published",
    category: d.category || "일상",
    title: d.title || "제목 없는 이야기",
    titles: Array.isArray(d.titles) ? d.titles : [],
    teaser: d.teaser || "",
    before_content: d.beforeContent || "",
    after_content: d.afterContent || "",
    story_bible: d.storyBible || "",
    gate_line: d.gateLine || "",
    hook: d.hook || "",
    cover_detail: d.coverDetail || "",
    caption: d.caption || "",
    hashtags,
    tags,
    fade_height: Math.max(80, Math.min(300, Number(d.fadeHeight) || 180)),
    source_image_paths: Array.isArray(d.imageIds) ? d.imageIds : [],
    published_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

async function studioSetting(key: string) {
  const { data, error } = await admin.from("ssul_settings").select("value").eq("key", key).maybeSingle();
  if (error) throw error;
  return data?.value || {};
}

async function saveStudioSetting(key: string, value: any) {
  const { error } = await admin
    .from("ssul_settings")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw error;
}

function bytesB64(bytes: Uint8Array) {
  let encoded = "";
  for (let i = 0; i < bytes.length; i += 32768) encoded += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(encoded);
}

function b64bytes(value: string) {
  const bin = atob(value.replace(/^data:[^;]+;base64,/, ""));
  return Uint8Array.from(bin, (char) => char.charCodeAt(0));
}

async function cryptoKey() {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`ssulpan-studio:${SERVICE_ROLE}`));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encrypt(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(OWNER_ID) },
    await cryptoKey(),
    new TextEncoder().encode(value),
  );
  return `${bytesB64(iv)}.${bytesB64(new Uint8Array(cipher))}`;
}

async function decrypt(value: string) {
  try {
    const [iv, cipher] = value.split(".");
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64bytes(iv), additionalData: new TextEncoder().encode(OWNER_ID) },
      await cryptoKey(),
      b64bytes(cipher),
    );
    return new TextDecoder().decode(plain);
  } catch {
    fail(503, "클로드 키를 다시 연결해 주세요.");
  }
}

async function credentials() {
  const setting = await studioSetting("studio_config");
  const key = setting.encryptedKey ? await decrypt(String(setting.encryptedKey)) : SERVER_ANTHROPIC_KEY;
  return { key, model: String(setting.model || Deno.env.get("CLAUDE_MODEL") || DEFAULT_MODEL) };
}

function upstreamError(status: number) {
  if (status === 401 || status === 403) return new HttpError(400, "클로드 API 키와 사용 권한을 확인해 주세요.");
  if (status === 429) return new HttpError(429, "클로드 사용 한도에 도달했어요. 잠시 후 다시 시도해 주세요.");
  if (status === 400) return new HttpError(400, "클로드 모델, API 잔액 또는 입력 분량을 확인해 주세요.");
  if (status === 404) return new HttpError(400, "선택한 클로드 모델을 사용할 수 없어요. 연결 설정에서 모델 ID를 확인해 주세요.");
  return new HttpError(502, "클로드가 응답하지 못했어요. 원고는 보관되어 있습니다.");
}

async function anthropicModels(key: string) {
  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/models?limit=100", {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    fail(502, "클로드 연결을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
  if (!response.ok) throw upstreamError(response.status);
  return (await response.json()).data || [];
}

async function getSettings() {
  const current = await credentials();
  return { configured: !!current.key, model: current.model };
}

async function saveSettings(keyInput: unknown, modelInput: unknown) {
  const model = string(modelInput, 120).trim();
  if (!/^claude-[a-z0-9.-]+$/.test(model)) fail(400, "클로드 모델 ID를 확인해 주세요.");
  const provided = string(keyInput, 300).trim();
  const key = provided || (await credentials()).key;
  if (!key) fail(400, "클로드 API 키를 입력해 주세요.");
  const models = await anthropicModels(key);
  if (!models.some((item: any) => item.id === model)) fail(400, "사용할 수 없는 모델 ID예요. 클로드 콘솔에서 모델 ID를 확인해 주세요.");
  await saveStudioSetting("studio_config", { encryptedKey: await encrypt(key), model });
  return { configured: true, model };
}

async function getWritingPrompt() {
  const value = await studioSetting("studio_writing_prompt");
  return { prompt: String(value.prompt || masterPrompt), revision: Number(value.revision || 0) };
}

async function saveWritingPrompt(prompt: unknown, revisionInput: unknown) {
  const revision = Number(revisionInput);
  if (typeof prompt !== "string" || prompt.length > 16000 || !Number.isInteger(revision) || revision < 0) {
    fail(400, "작성 지침과 저장 상태를 확인해 주세요.");
  }
  const current = await getWritingPrompt();
  if (current.revision !== revision) fail(409, "다른 창에서 작성 지침이 바뀌었어요. 작성 지침을 다시 불러온 뒤 저장해 주세요.");
  const next = { prompt: prompt.trim(), revision: revision + 1 };
  await saveStudioSetting("studio_writing_prompt", next);
  return next;
}

async function listDrafts() {
  const [{ data: rows, error }, { data: posts, error: postError }] = await Promise.all([
    admin.from("ssul_drafts").select("id,data,revision,updated_at").eq("owner_id", OWNER_ID).order("updated_at", { ascending: false }),
    admin.from("ssul_posts").select("id,title,updated_at,published_at").eq("status", "published").order("published_at", { ascending: false }),
  ]);
  if (error) throw error;
  if (postError) throw postError;
  const seen = new Set((rows || []).map((row: any) => String(row.id)));
  const published = new Set((posts || []).map((post: any) => String(post.id)));
  return {
    drafts: [
      ...(rows || []).map((row: any) => ({
        id: String(row.id),
        title: row.data?.title || "제목 없는 원고",
        revision: Number(row.revision || 0),
        updatedAt: Date.parse(row.updated_at) || 0,
        published: published.has(String(row.id)),
      })),
      ...(posts || []).filter((post: any) => !seen.has(String(post.id))).map((post: any) => ({
        id: String(post.id),
        title: post.title || "제목 없는 원고",
        revision: 0,
        updatedAt: Date.parse(post.updated_at || post.published_at) || 0,
        published: true,
      })),
    ],
  };
}

async function getDraft(draftId: string) {
  id(draftId);
  const { data, error } = await admin
    .from("ssul_drafts")
    .select("id,data,revision,updated_at")
    .eq("id", draftId)
    .eq("owner_id", OWNER_ID)
    .maybeSingle();
  if (error) throw error;
  if (data) return { id: String(data.id), data: cleanDraft(data.data), revision: Number(data.revision || 0), updatedAt: Date.parse(data.updated_at) || 0 };
  const { data: post, error: postError } = await admin.from("ssul_posts").select("*").eq("id", draftId).maybeSingle();
  if (postError) throw postError;
  if (post) return { id: draftId, data: postToDraft(post), revision: 0, updatedAt: Date.parse(post.updated_at || post.published_at) || 0 };
  fail(404, "원고를 찾지 못했어요.");
}

async function saveDraft(draftId: string, input: any) {
  id(draftId);
  const data = cleanDraft(input.data);
  const revision = Number(input.revision);
  if (!Number.isInteger(revision) || revision < 0) fail(400, "저장 상태를 확인해 주세요.");
  const { data: old, error } = await admin
    .from("ssul_drafts")
    .select("revision,data")
    .eq("id", draftId)
    .eq("owner_id", OWNER_ID)
    .maybeSingle();
  if (error) throw error;
  if (Number(old?.revision || 0) !== revision) fail(409, "다른 창에서 원고가 변경됐어요. 현재 내용을 내보낸 뒤 원고를 다시 열어 주세요.");
  if (old) {
    const { error: versionError } = await admin.from("ssul_versions").insert({
      draft_id: draftId,
      owner_id: OWNER_ID,
      revision: Number(old.revision),
      reason: string(input.reason, 100) || "수정 전 원고",
      data: old.data,
    });
    if (versionError) throw versionError;
  }
  const nextRevision = revision + 1;
  const updatedAt = new Date().toISOString();
  const { error: saveError } = await admin.from("ssul_drafts").upsert(
    { id: draftId, owner_id: OWNER_ID, data, revision: nextRevision, updated_at: updatedAt },
    { onConflict: "id" },
  );
  if (saveError) throw saveError;
  return { id: draftId, data, revision: nextRevision, updatedAt: Date.parse(updatedAt) };
}

async function listVersions(draftId: string) {
  id(draftId);
  const { data, error } = await admin
    .from("ssul_versions")
    .select("id,data,reason,created_at,revision")
    .eq("draft_id", draftId)
    .eq("owner_id", OWNER_ID)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return { versions: data || [] };
}

async function publishDraft(draftId: string, revision: number) {
  const current = await getDraft(draftId);
  if (current.revision !== revision) fail(409, "최신 원고를 저장한 뒤 게시해 주세요.");
  assertPublish(current.data);
  const { error } = await admin.from("ssul_posts").upsert(postRow(draftId, current.data), { onConflict: "id" });
  if (error) throw error;
  return { url: `/stories/${draftId}/` };
}

async function listJobs() {
  const { data, error } = await admin
    .from("ssul_jobs")
    .select("id,draft_id,action,status,result,error,created_at,provider,model")
    .eq("owner_id", OWNER_ID)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return {
    jobs: (data || []).map((job: any) => ({
      ...job,
      status: job.status === "running" && Date.now() - Date.parse(job.created_at) > 360000 ? "interrupted" : job.status,
    })),
  };
}

async function ensureImageBucket() {
  const { data, error } = await admin.storage.listBuckets();
  if (error) throw error;
  if (!(data || []).some((bucket: any) => bucket.id === IMAGE_BUCKET)) {
    const { error: createError } = await admin.storage.createBucket(IMAGE_BUCKET, {
      public: false,
      fileSizeLimit: 12 * 1024 * 1024,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    });
    if (createError) throw createError;
  }
}

async function ensureArtifactBucket() {
  const { data, error } = await admin.storage.listBuckets();
  if (error) throw error;
  if (!(data || []).some((bucket: any) => bucket.id === ARTIFACT_BUCKET)) {
    const { error: createError } = await admin.storage.createBucket(ARTIFACT_BUCKET, {
      public: false,
      fileSizeLimit: 5 * 1024 * 1024,
      allowedMimeTypes: ["application/json", "text/plain"],
    });
    if (createError) throw createError;
  }
}

async function putArtifact(path: string, value: string, contentType = "application/json") {
  await ensureArtifactBucket();
  const { error } = await admin.storage.from(ARTIFACT_BUCKET).upload(path, value, { contentType, upsert: true });
  if (error) throw error;
}

async function getArtifact(path: string) {
  await ensureArtifactBucket();
  const { data, error } = await admin.storage.from(ARTIFACT_BUCKET).download(path);
  if (error || !data) return null;
  return await data.text();
}

async function uploadImage(input: any) {
  await ensureImageBucket();
  const mime = String(input.mime || "");
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) fail(415, "JPG, PNG, WebP 이미지를 올려 주세요.");
  const bytes = b64bytes(String(input.base64 || ""));
  if (!bytes.length || bytes.length > 4 * 1024 * 1024) fail(413, "이미지는 4MB 이하로 올려 주세요.");
  const valid = mime === "image/png"
    ? bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71
    : mime === "image/jpeg"
      ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  if (!valid) fail(415, "정상적인 이미지 파일인지 확인해 주세요.");
  const imageId = crypto.randomUUID();
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const path = `source/${OWNER_ID}/${imageId}.${ext}`;
  const { error } = await admin.storage.from(IMAGE_BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
  if (error) throw error;
  const { error: rowError } = await admin.from("ssul_images").insert({
    id: imageId,
    owner_id: OWNER_ID,
    bucket: IMAGE_BUCKET,
    object_path: path,
    mime_type: mime,
    size_bytes: bytes.length,
    kind: "source",
  });
  if (rowError) {
    await admin.storage.from(IMAGE_BUCKET).remove([path]);
    throw rowError;
  }
  return { id: imageId, name: string(input.name, 180) || "이미지", url: `/api/images/${imageId}` };
}

async function imageUrl(imageId: string) {
  id(imageId);
  const { data, error } = await admin
    .from("ssul_images")
    .select("id,bucket,object_path,mime_type")
    .eq("id", imageId)
    .eq("owner_id", OWNER_ID)
    .maybeSingle();
  if (error) throw error;
  if (!data) fail(404, "이미지를 찾을 수 없어요.");
  const { data: signed, error: signError } = await admin.storage.from(data.bucket).createSignedUrl(data.object_path, 300);
  if (signError) throw signError;
  return { url: signed.signedUrl, mime: data.mime_type };
}

async function loadImages(ids: string[]) {
  if (!ids.length) return [];
  const requested = ids.slice(0, 8);
  const { data, error } = await admin
    .from("ssul_images")
    .select("id,bucket,object_path,mime_type,size_bytes")
    .eq("owner_id", OWNER_ID)
    .in("id", requested);
  if (error) throw error;
  const byId = new Map((data || []).map((row: any) => [String(row.id), row]));
  let total = 0;
  const blocks = [];
  for (const imageId of requested) {
    const row: any = byId.get(imageId);
    if (!row) fail(400, "첨부 이미지를 찾지 못했어요. 다시 올려 주세요.");
    total += Number(row.size_bytes || 0);
    if (total > 12 * 1024 * 1024) fail(413, "첨부 이미지 합계가 12MB를 넘어요. 크기를 줄이거나 일부 이미지를 제외해 주세요.");
    const { data: file, error: fileError } = await admin.storage.from(row.bucket).download(row.object_path);
    if (fileError || !file) throw fileError || new Error("이미지를 읽지 못했습니다.");
    blocks.push({
      type: "image",
      source: { type: "base64", media_type: row.mime_type || "image/jpeg", data: bytesB64(new Uint8Array(await file.arrayBuffer())) },
    });
  }
  return blocks;
}

async function checkpoint(trace: any, stage: string) {
  if (!trace) return;
  trace.stage = stage;
  trace.events.push({ stage, at: new Date().toISOString() });
  try {
    const {error} = await admin.from("ssul_jobs").update({result:{diagnostics:trace}}).eq("id",trace.jobId).eq("owner_id",OWNER_ID);
    if(error)throw error;
  }catch{console.error("diagnostic_checkpoint_failed",{jobId:trace.jobId,stage});}
}

async function claudeRequest(cred: any, action: string, d: any, target: string, instruction: string, prompt = "", images: any[] = [], override: any = null, trace: any = null) {
  const request = override || promptFor(action, d, target, instruction, prompt);
  const content = [...images, { type: "text", text: request.text }];
  const call: any = {action,model:cred.model,startedAt:new Date().toISOString(),status:"running",strict:true};
  if(trace)trace.providerCalls.push(call);
  const started=Date.now();
  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": cred.key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: cred.model,
        max_tokens: action === "generate" ? 16000 : action === "extract" ? 10000 : action === "prompt" ? 6000 : 8000,
        system: request.system,
        messages: [{ role: "user", content }],
        tools: [{ name: "deliver_result", description: "편집 결과를 정해진 형식으로 반환합니다.", strict:true, input_schema: strictSchema(request.schema) }],
        tool_choice: { type: "tool", name: "deliver_result" },
      }),
      signal: AbortSignal.timeout(150000),
    });
  } catch (cause) {
    call.status="failed";call.elapsedMs=Date.now()-started;
    throw Object.assign(new HttpError(504,"클로드 응답을 받지 못했어요. 입력 원고는 보존했습니다."),{code:(cause as any)?.name==="TimeoutError"?"PROVIDER_TIMEOUT":"PROVIDER_NETWORK",provider:{elapsedMs:call.elapsedMs}});
  }
  call.elapsedMs=Date.now()-started;call.httpStatus=response.status;call.requestId=response.headers.get("request-id")||response.headers.get("x-request-id");
  const rawText=await response.text();
  let output:any;
  try{output=JSON.parse(rawText);}catch{call.status="failed";throw Object.assign(new HttpError(502,"클로드 서버 응답을 JSON으로 읽지 못했어요."),{code:"PROVIDER_INVALID_JSON",provider:{httpStatus:response.status,requestId:call.requestId}});}
  if (!response.ok) {
    call.status="failed";call.errorType=output?.error?.type;
    throw Object.assign(upstreamError(response.status),{code:"PROVIDER_HTTP_"+response.status,provider:{httpStatus:response.status,requestId:call.requestId,type:output?.error?.type,message:safeMessage(output?.error?.message)}});
  }
  call.stopReason=output.stop_reason;call.usage=output.usage;call.responseId=output.id;
  call.fields=fieldReport(request.schema,output.content?.find((c:any)=>c.type==="tool_use"&&c.name==="deliver_result")?.input);
  if(trace){
    const prefix=`private/${await hashText(OWNER_ID)}/responses/${trace.jobId}/${trace.providerCalls.length}.json`;
    try{await putArtifact(prefix,JSON.stringify(output));call.rawSaved=true;}catch{call.rawSaved=false;}
  }
  try{const result=parseToolOutput(output);call.status="done";return {result,usage:output.usage,model:cred.model};}
  catch(error){call.status="failed";throw error;}
}

async function hashText(text: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function callClaude(action: string, initialDraft: any, target: string, instruction: string, jobId: string, scope: any = null, trace: any = null, recovery: any = null) {
  const cred = await credentials();
  if (!cred.key) fail(428, "제작실 상단의 클로드 연결에서 API 키를 등록해 주세요.");
  let d = initialDraft;
  const baseData = recovery?.baseData || JSON.stringify(Object.fromEntries(await Promise.all(
    Object.entries(d).map(async ([key, value]) => [key, await hashText(JSON.stringify(value))]),
  )));
  const saved = await getWritingPrompt();
  if(trace){trace.promptRevision=saved.revision;trace.model=cred.model;await checkpoint(trace,"prepare");}
  let calls = 0;
  const usage: any[] = [];
  const invoke = async (requestedAction: string, data = d, images: any[] = [], override: any = null) => {
    calls += 1;
    await checkpoint(trace,requestedAction);
    const output = await claudeRequest(cred, requestedAction, data, target, instruction, saved.prompt, images, override, trace);
    usage.push(output.usage);
    return output.result;
  };
  const ownerPrefix = `private/${await hashText(OWNER_ID)}/`;
  if (d.sourceText) await putArtifact(`${ownerPrefix}source/${await hashText(d.sourceText)}`, d.sourceText, "text/plain");
  let extracted: any = null;
  if (!recovery && ["generate", "extract"].includes(action) && d.imageIds.length) {
    const images = await loadImages(d.imageIds);
    const imageKey = await hashText(JSON.stringify(d.imageIds));
    const cacheKey = `${ownerPrefix}ocr/${imageKey}`;
    const cached = await getArtifact(cacheKey);
    if (cached) {extracted = JSON.parse(cached);if(trace)trace.ocrCacheHit=true;}
    else {
      extracted = validateResult("extract", await invoke("extract", d, images), d);
      await putArtifact(cacheKey, JSON.stringify(extracted));
    }
    if (d.sourceImageKey !== imageKey) {
      d = { ...d, sourceText: [d.sourceText, extracted.text].filter(Boolean).join("\n\n"), sourceImageKey: imageKey };
    }
    if (d.sourceText) await putArtifact(`${ownerPrefix}source/${await hashText(d.sourceText)}`, d.sourceText, "text/plain");
    d = cleanDraft(d);
  }
  let result: any;
  if (action === "extract") {
    result = { ...extracted, sourceText: d.sourceText, sourceImageKey: d.sourceImageKey };
  } else {
    let override = null;
    if (action === "rewrite" && scope) {
      override = promptFor(action, d, target, instruction, saved.prompt);
      override.text += `\n\n수정 범위(문자 오프셋, 끝 제외): ${JSON.stringify(scope)}\n선택 구간 밖의 앞·뒤 문자열은 공백과 줄바꿈까지 그대로 복사한다. text에는 대상 본문 구간 전체를 반환한다.`;
    }
    let raw = recovery ? recovery.result : await invoke(action, d, [], override);
    await putArtifact(`${ownerPrefix}candidate/${jobId}`, JSON.stringify({
      action,
      result: raw,
      baseData,
      sourceText: d.sourceText,
      sourceImageKey: d.sourceImageKey,
    }));
    if(action==="generate"){
      const completed=await completeMetadata(raw,(request:any)=>invoke("metadata_repair",d,[],request));
      raw=completed.result;
      if(trace&&completed.repaired.length)trace.repairs.push({type:"metadata",fields:completed.repaired});
    }
    if (["generate", "social"].includes(action)) {
      let candidate = action === "generate"
        ? { ...d, ...raw }
        : { ...d, ...Object.fromEntries(SOCIAL_FIELDS.map((key) => [key, raw[key]])) };
      const invalidFields = [...new Set(socialIssues(candidate).errors.map((issue: any) => issue.field))];
      if (invalidFields.length) {
        try {
          const repair = await buildSocialRepairRequest(candidate, { fields: invalidFields, revision: 0 });
          const fixed = await invoke("social", d, [], repair.providerRequest);
          candidate = (await applySocialRepair(candidate, fixed, repair, { revision: 0 })).candidate;
          if(trace)trace.repairs.push({type:"social",fields:invalidFields});
        } catch(error) {
          throw Object.assign(new HttpError(502,"부가 문구 보정이 완료되지 않았어요. 생성한 본문은 보관했습니다."),{code:"SOCIAL_REPAIR_FAILED",details:{fields:invalidFields,cause:failureInfo(error,"social")}});
        }
      }
      raw = action === "generate"
        ? { ...raw, ...Object.fromEntries(SOCIAL_FIELDS.map((key) => [key, candidate[key]])) }
        : Object.fromEntries(SOCIAL_FIELDS.map((key) => [key, candidate[key]]));
    }
    await checkpoint(trace,"validate");
    result = validateResult(action, raw, d);
    if (action === "rewrite" && scope) {
      const text = d[target === "before" ? "beforeContent" : "afterContent"];
      const prefix = text.slice(0, scope.start);
      const suffix = text.slice(scope.end);
      if (result.text.length < prefix.length + suffix.length || !result.text.startsWith(prefix) || !result.text.endsWith(suffix)) {
        throw Object.assign(new HttpError(502,"선택한 범위 밖의 문장이 바뀌어 반영하지 않았어요. 기존 원고는 유지했습니다."),{code:"REWRITE_OUTSIDE_SCOPE"});
      }
    }
    if (action === "generate") result = { ...result, sourceText: d.sourceText, sourceImageKey: d.sourceImageKey };
  }
  if (["generate", "review"].includes(action) && d.sourceText) {
    await checkpoint(trace,"preservation");
    const baseline = await createSourceBaseline({
      sourceText: d.sourceText,
      complete: !extracted?.uncertain && !d.sourceText.includes("[판독 불가]"),
    });
    const preservation = await inspectSourcePreservation({
      sourceText: d.sourceText,
      resultText: action === "generate" ? `${result.beforeContent}\n\n${result.afterContent}` : `${d.beforeContent}\n\n${d.afterContent}`,
      baseline,
    });
    result.preservation = preservation;
    if (action === "review") result.summary += `\n\n원문 보존 자동 검사(의미 일치 판정 아님): ${JSON.stringify(preservation.issues)}`;
  }
  return { result, calls, usage, model: cred.model, promptUsage: null, promptRevision: saved.revision, baseData };
}

async function runJob(input: any) {
  const jobId = id(String(input.jobId || crypto.randomUUID()));
  const draftId = id(String(input.draftId || "new"));
  const action = String(input.action === "job_run" ? input.jobAction || "" : input.action || "");
  let d = cleanDraft(input.data);
  let recovery:any=null;
  if(input.recoverJobId){
    if(action!=="generate")fail(400,"전체 생성 결과만 복구할 수 있어요.");
    const old=await jobCandidate(id(String(input.recoverJobId)));
    const {data:oldJob,error}=await admin.from("ssul_jobs").select("draft_id,action").eq("id",input.recoverJobId).eq("owner_id",OWNER_ID).maybeSingle();
    if(error)throw error;
    if(!oldJob||String(oldJob.draft_id)!==draftId||old.action!=="generate")fail(400,"같은 원고의 전체 생성 결과를 선택해 주세요.");
    recovery=old;
    d=cleanDraft({...d,sourceText:old.sourceText||d.sourceText,sourceImageKey:old.sourceImageKey||d.sourceImageKey});
  }
  const target = action === "rewrite" ? input.target : undefined;
  if (action === "rewrite" && !["before", "after"].includes(target)) fail(400, "수정할 구간을 지정해 주세요.");
  if (!["generate", "rewrite", "extract", "social", "review", "split", "prompt"].includes(action)) fail(400, "작업을 확인해 주세요.");
  if (action === "extract" && !d.imageIds.length) fail(400, "글을 읽을 이미지를 먼저 올려 주세요.");
  if (action === "generate" && !d.sourceText.trim() && !d.notes.trim() && !d.imageIds.length && !d.beforeContent.trim() && !d.afterContent.trim()) {
    fail(400, "소재 내용이나 작성 요청을 입력해 주세요.");
  }
  if (["rewrite", "social", "review", "split"].includes(action) && !d.beforeContent.trim() && !d.afterContent.trim()) {
    fail(400, "원고를 먼저 작성해 주세요.");
  }
  if (input.instruction) d.rewriteInstruction = string(input.instruction, 2000);
  let scope = null;
  if (action === "rewrite" && input.scope != null) {
    const value = input.scope;
    const text = d[target === "before" ? "beforeContent" : "afterContent"];
    if (!Number.isInteger(value.start) || !Number.isInteger(value.end) || value.start < 0 || value.end <= value.start || value.end > text.length) {
      fail(400, "수정할 선택 범위를 확인해 주세요.");
    }
    scope = { start: value.start, end: value.end };
  }
  const cred = await credentials();
  if (!cred.key) fail(428, "클로드 연결에서 API 키를 등록해 주세요.");
  const { data: existing, error: existingError } = await admin
    .from("ssul_jobs")
    .select("id,status,result,error")
    .eq("id", jobId)
    .eq("owner_id", OWNER_ID)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    if (existing.status === "done" && existing.result) return { id: jobId, ...existing.result };
    fail(409, existing.error || "이 작업은 이미 진행 중이에요. 작업 기록에서 확인해 주세요.");
  }
  const cutoff = new Date(Date.now() - 360000).toISOString();
  const { data: running, error: runningError } = await admin
    .from("ssul_jobs")
    .select("id")
    .eq("owner_id", OWNER_ID)
    .eq("status", "running")
    .gte("created_at", cutoff)
    .limit(1);
  if (runningError) throw runningError;
  if ((running || []).length) fail(409, "진행 중인 클로드 작업이 있어요. 작업 기록에서 확인해 주세요.");
  const instruction = string(input.instruction, 2000);
  const model = cred.model;
  const trace:any={version:1,release:GENERATION_RELEASE,jobId,draftId,action,model,stage:"queued",startedAt:new Date().toISOString(),events:[],providerCalls:[],repairs:[],...(input.recoverJobId?{recoveredFrom:input.recoverJobId}:{})};
  const { error: insertError } = await admin.from("ssul_jobs").insert({
    id: jobId,
    owner_id: OWNER_ID,
    draft_id: draftId,
    action,
    provider: "claude",
    model,
    status: "running",
    result: {diagnostics:trace},
    input: { data: d, target, instruction, scope },
  });
  if (insertError) throw insertError;
  try {
    const output = await callClaude(action, d, target, instruction, jobId, scope, trace, recovery);
    trace.stage="completed";trace.finishedAt=new Date().toISOString();trace.elapsedMs=Date.now()-Date.parse(trace.startedAt);
    const envelope = { ...output, target, diagnostics:trace };
    const { error: updateError } = await admin.from("ssul_jobs").update({
      status: "done",
      result: envelope,
      usage: output.usage,
      model: output.model,
      finished_at: new Date().toISOString(),
    }).eq("id", jobId).eq("owner_id", OWNER_ID);
    if (updateError) throw updateError;
    return { id: jobId, ...envelope };
  } catch (error) {
    const message = safeMessage(error instanceof Error ? error.message : String(error));
    trace.error=failureInfo(error,trace.stage);trace.finishedAt=new Date().toISOString();trace.elapsedMs=Date.now()-Date.parse(trace.startedAt);
    (error as any).diagnostics=trace;
    await admin.from("ssul_jobs").update({ status: "failed", error: message, result:{diagnostics:trace}, usage:trace.providerCalls.map((call:any)=>call.usage).filter(Boolean), finished_at: new Date().toISOString() })
      .eq("id", jobId).eq("owner_id", OWNER_ID);
    throw error;
  }
}

async function jobDiagnostics(jobId:string){
  id(jobId);
  const {data:job,error}=await admin.from("ssul_jobs").select("id,draft_id,action,status,error,model,result,created_at,finished_at").eq("id",jobId).eq("owner_id",OWNER_ID).maybeSingle();
  if(error)throw error;if(!job)fail(404,"작업이 없어요.");
  if(job.result?.diagnostics)return {diagnostics:{...job.result.diagnostics,status:job.status}};
  let report:any=null;
  try{const candidate=await jobCandidate(jobId);report=fieldReport(schemas[job.action],candidate.result);}catch{}
  return {diagnostics:{version:1,release:"legacy",jobId:job.id,draftId:job.draft_id,action:job.action,status:job.status,model:job.model,startedAt:job.created_at,finishedAt:job.finished_at,stage:report?"validate":"unknown",error:job.error?{code:report?.missing.length||report?.extra.length||report?.invalid.length?"RESULT_SCHEMA_INVALID":"LEGACY_ERROR",message:safeMessage(job.error),fields:report}:null,providerCalls:[],note:"이전 버전은 제공사 요청 ID·응답 종료 사유를 기록하지 않았습니다."}};
}

async function jobCandidate(jobId: string) {
  id(jobId);
  const { data, error } = await admin.from("ssul_jobs").select("id").eq("id", jobId).eq("owner_id", OWNER_ID).maybeSingle();
  if (error) throw error;
  if (!data) fail(404, "작업이 없어요.");
  const ownerPrefix = `private/${await hashText(OWNER_ID)}/`;
  const candidate = await getArtifact(`${ownerPrefix}candidate/${jobId}`);
  if (!candidate) fail(404, "보관된 결과가 없어요.");
  return JSON.parse(candidate);
}

const sourceHosts = new Set([
  "bboom.naver.com", "m.bboom.naver.com", "pann.nate.com", "m.pann.nate.com", "www.reddit.com", "old.reddit.com",
  "theqoo.net", "www.teamblind.com", "www.bobaedream.co.kr", "m.bobaedream.co.kr", "gall.dcinside.com", "m.dcinside.com",
  "www.fmkorea.com", "www.instiz.net",
]);

function sourceURL(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { fail(400, "올바른 글 주소를 입력해 주세요."); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || !sourceHosts.has(url.hostname)) {
    fail(400, "이 주소는 자동으로 읽을 수 없어요. 글을 복사하거나 이미지를 올려 주세요.");
  }
  return url;
}

async function readSource(value: string) {
  let url = sourceURL(value);
  let response: Response | undefined;
  for (let i = 0; i < 4; i += 1) {
    try {
      response = await fetch(url.href, { redirect: "manual", headers: { Accept: "text/html" }, signal: AbortSignal.timeout(15000) });
    } catch {
      fail(502, "원문 사이트에 연결하지 못했어요. 텍스트나 이미지를 넣어 주세요.");
    }
    if (response.status >= 300 && response.status < 400) {
      url = sourceURL(new URL(response.headers.get("location") || "", url).href);
      continue;
    }
    break;
  }
  if (!response?.ok) fail(422, "원문 사이트에서 읽기를 허용하지 않았어요. 텍스트나 이미지를 넣어 주세요.");
  if (!response.headers.get("content-type")?.includes("text/html")) fail(422, "본문 페이지가 아니에요. 텍스트나 이미지를 넣어 주세요.");
  const raw = new Uint8Array(await response.arrayBuffer());
  if (raw.length > 1800000) fail(413, "원문 페이지가 너무 커요. 글을 복사하거나 이미지를 올려 주세요.");
  const charset = response.headers.get("content-type")?.match(/charset=([\w-]+)/i)?.[1] || "utf-8";
  let source: string;
  try { source = new TextDecoder(charset).decode(raw); } catch { source = new TextDecoder().decode(raw); }
  source = source.replace(/<(script|style|nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
  const main = source.match(/<(?:article|main)\b[^>]*>([\s\S]*?)<\/(?:article|main)>/i);
  if (main) source = main[1];
  const text = source
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(?:br|\/p|\/div|\/li|\/h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(?:nbsp|amp|lt|gt|quot|apos);/g, (entity) => ({ "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" }[entity] || entity))
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, number) => {
      const code = number[0].toLowerCase() === "x" ? parseInt(number.slice(1), 16) : Number(number);
      return code <= 1114111 ? String.fromCodePoint(code) : "";
    })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n\n");
  if (text.length < 100) fail(422, "읽을 수 있는 본문이 부족해요. 텍스트나 이미지를 넣어 주세요.");
  return { text, url: url.href };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (request.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "");
    let result: any;
    if (action === "settings_get") result = await getSettings();
    else if (action === "settings_save") result = await saveSettings(body.key, body.model);
    else if (action === "writing_prompt_get") result = await getWritingPrompt();
    else if (action === "writing_prompt_save") result = await saveWritingPrompt(body.prompt, body.revision);
    else if (action === "drafts_list") result = await listDrafts();
    else if (action === "draft_get") result = await getDraft(String(body.id || ""));
    else if (action === "draft_save") result = await saveDraft(String(body.id || ""), body);
    else if (action === "versions_list") result = await listVersions(String(body.id || ""));
    else if (action === "publish") result = await publishDraft(String(body.id || ""), Number(body.revision));
    else if (action === "jobs_list") result = await listJobs();
    else if (action === "job_run" || ["generate", "rewrite", "extract", "social", "review", "split", "prompt"].includes(action)) result = await runJob(body);
    else if (action === "job_diagnostics") result = await jobDiagnostics(String(body.id||""));
    else if (action === "job_candidate") result = await jobCandidate(String(body.id || ""));
    else if (action === "image_upload") result = await uploadImage(body);
    else if (action === "image_url") result = await imageUrl(String(body.id || ""));
    else if (action === "source_read") result = await readSource(String(body.url || ""));
    else fail(404, "요청한 기능을 찾을 수 없어요.");
    return json({ ok: true, ...result });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : Number((error as any)?.status) || 500;
    if (!(error instanceof HttpError)) console.error("studio_request_failed", error);
    return json({ ok: false, error: safeMessage(error instanceof Error ? error.message : String(error)), diagnostics:(error as any)?.diagnostics||{release:GENERATION_RELEASE,stage:"request_validation",error:failureInfo(error,"request_validation")} }, status);
  }
});
