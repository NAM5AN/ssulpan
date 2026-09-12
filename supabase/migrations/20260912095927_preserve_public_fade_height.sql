alter table public.ssul_posts
  add column if not exists fade_height integer not null default 180;

alter table public.ssul_posts
  drop constraint if exists ssul_posts_fade_height_check;

alter table public.ssul_posts
  add constraint ssul_posts_fade_height_check
  check (fade_height between 80 and 300);
