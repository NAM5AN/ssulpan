-- Isolated from manuscript/public tables. Only the authenticated studio backend
-- uses this table; public/anon/authenticated API roles have no direct access.
create table public.ssul_instagram_decks (
  key text primary key check (key ~ '^[a-f0-9]{64}$'),
  revision integer not null default 1 check (revision > 0),
  data jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 14680064),
  updated_at timestamptz not null default now()
);
alter table public.ssul_instagram_decks enable row level security;
revoke all on table public.ssul_instagram_decks from public, anon, authenticated;
grant select, insert, update on table public.ssul_instagram_decks to service_role;
create function public.ssul_instagram_save_v1(p_key text,p_data jsonb,p_expected integer)
returns table(key text,revision integer,updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if p_expected = 0 then
    return query insert into public.ssul_instagram_decks as d (key,data)
      values (p_key,p_data) on conflict do nothing returning d.key,d.revision,d.updated_at;
  elsif p_expected > 0 then
    return query update public.ssul_instagram_decks as d
      set data=p_data,revision=d.revision+1,updated_at=now()
      where d.key=p_key and d.revision=p_expected returning d.key,d.revision,d.updated_at;
  else
    raise exception 'invalid revision' using errcode='22023';
  end if;
  if not found then raise exception 'revision conflict' using errcode='40001'; end if;
end;
$$;
revoke all on function public.ssul_instagram_save_v1(text,jsonb,integer) from public, anon, authenticated;
grant execute on function public.ssul_instagram_save_v1(text,jsonb,integer) to service_role;
