import {createHandler} from './handler.mjs';
function defaultKey(name:string){try{const keys=JSON.parse(Deno.env.get(name)||'{}');return keys.default||Object.values(keys)[0]||'';}catch{return '';}}
Deno.serve(createHandler({
  url:Deno.env.get('SUPABASE_URL')||'',
  publicKey:defaultKey('SUPABASE_PUBLISHABLE_KEYS')||Deno.env.get('SUPABASE_ANON_KEY')||'',
  serviceKey:defaultKey('SUPABASE_SECRET_KEYS')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||''
}));
