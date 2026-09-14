-- Recoverable deletion. Only the authenticated Edge Function's service role
-- may call this operation. No public data or existing rows are changed here.
create or replace function public.ssul_keep_deleted_story()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare archived jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ssul-story:' || new.id, 0));
  select d.data into archived from public.ssul_drafts d where d.id = new.id;
  if archived ? 'deletedAt' then
    raise sqlstate 'PT410' using message = 'Deleted story cannot be saved or published';
  end if;
  if tg_table_name = 'ssul_drafts' and tg_op = 'UPDATE' then
    if new.revision <> old.revision + 1 then
      raise sqlstate 'PT409' using message = 'Draft revision conflict';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.ssul_keep_deleted_story() from public, anon, authenticated;
grant execute on function public.ssul_keep_deleted_story() to service_role;

create trigger ssul_drafts_keep_deleted
before insert or update on public.ssul_drafts
for each row execute function public.ssul_keep_deleted_story();

-- View-count updates do not need to lock or inspect an editor record.
create trigger ssul_posts_keep_deleted
before insert or update of status, title, before_content, after_content on public.ssul_posts
for each row when (new.status = 'published')
execute function public.ssul_keep_deleted_story();

create or replace function public.ssul_archive_story(story_id text, expected_revision integer)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare
  draft public.ssul_drafts%rowtype;
  deleted_at timestamptz := pg_catalog.clock_timestamp();
begin
  if story_id is null or story_id !~ '^[a-zA-Z0-9_-]{1,100}$'
     or expected_revision is null or expected_revision < 0 then
    raise sqlstate 'PT400' using message = 'Invalid story or revision';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ssul-story:' || story_id, 0));
  select * into draft from public.ssul_drafts
    where id = story_id and owner_id = '00000000-0000-0000-0000-000000000001' for update;
  if not found then
    raise sqlstate 'PT404' using message = 'Draft not found';
  end if;
  if draft.data ? 'deletedAt' then
    return pg_catalog.jsonb_build_object('id', story_id, 'deleted', true);
  end if;
  if draft.revision <> expected_revision then
    raise sqlstate 'PT409' using message = 'Draft revision conflict';
  end if;
  insert into public.ssul_versions(draft_id, owner_id, revision, reason, data)
    values (story_id, draft.owner_id, draft.revision, '삭제 전 복구용 기록', draft.data);
  update public.ssul_drafts
    set data = draft.data || pg_catalog.jsonb_build_object('deletedAt', deleted_at),
        revision = draft.revision + 1, updated_at = deleted_at
    where id = story_id and owner_id = draft.owner_id;
  update public.ssul_posts set status = 'archived', updated_at = deleted_at where id = story_id;
  return pg_catalog.jsonb_build_object('id', story_id, 'deleted', true);
end;
$$;
revoke all on function public.ssul_archive_story(text, integer) from public, anon, authenticated;
grant execute on function public.ssul_archive_story(text, integer) to service_role;
