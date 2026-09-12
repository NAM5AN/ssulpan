import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store",
};

function secretKey() {
  const direct = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY");
  if (direct) return direct;
  try {
    const dict = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    return dict.default || Object.values(dict)[0] || "";
  } catch {
    return "";
  }
}

const url = Deno.env.get("SUPABASE_URL") || "";
const db = createClient(url, secretKey(), { auth: { persistSession: false, autoRefreshToken: false } });

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

function hashtags(value: unknown) {
  return Array.isArray(value)
    ? value.filter((tag) => typeof tag === "string" && tag.trim()).map((tag) => tag.trim()).join(" ")
    : String(value || "");
}

function toPublic(row: any) {
  return {
    id: String(row.id),
    title: String(row.title || ""),
    category: String(row.category || "일상"),
    teaser: String(row.teaser || ""),
    beforeContent: String(row.before_content || ""),
    afterContent: String(row.after_content || ""),
    hook: String(row.hook || ""),
    coverDetail: String(row.cover_detail || ""),
    caption: String(row.caption || ""),
    hashtags: hashtags(row.hashtags),
    fadeHeight: Math.max(80, Math.min(300, Number(row.fade_height) || 180)),
    gateLine: String(row.gate_line || ""),
    views: Number(row.view_count || 0),
  };
}

const SELECT = "id,category,title,teaser,before_content,after_content,gate_line,hook,cover_detail,caption,hashtags,fade_height,view_count,published_at";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const u = new URL(req.url);
    if (req.method === "GET") {
      const postId = u.searchParams.get("id");
      if (postId) {
        const { data, error } = await db.from("ssul_posts").select(SELECT).eq("id", postId).eq("status", "published").maybeSingle();
        if (error) throw error;
        if (!data) return json({ ok: false, error: "NOT_FOUND" }, 404);
        return json({ ok: true, post: toPublic(data) });
      }
      const limit = Math.min(100, Math.max(1, Number(u.searchParams.get("limit") || 100)));
      const { data, error } = await db.from("ssul_posts").select(SELECT).eq("status", "published").order("published_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return json({ ok: true, posts: (data || []).map(toPublic) });
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (body?.action !== "view" || !body?.id) return json({ ok: false, error: "BAD_REQUEST" }, 400);
      const postId = String(body.id);
      const { data, error } = await db.rpc("ssul_increment_view", { p_id: postId });
      if (error) throw error;
      return json({ ok: true, id: postId, views: Number(data || 0) });
    }

    return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  } catch (error) {
    console.error(error);
    return json({ ok: false, error: String((error as any)?.message || error) }, 500);
  }
});
