create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  bio text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''))
  on conflict (id) do update set display_name = excluded.display_name;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.articles (
  id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  slug text not null unique,
  title text not null default '',
  summary text not null default '',
  category text not null default 'テクノロジー',
  cover_url text not null default '',
  content_json jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.article_blocks (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  block_type text not null,
  content jsonb not null default '{}'::jsonb,
  position integer not null check (position >= 0),
  layout jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (article_id, position)
);

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique
);

create table if not exists public.article_tags (
  article_id uuid not null references public.articles(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (article_id, tag_id)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  body text not null check (length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.likes (
  user_id uuid not null references public.users(id) on delete cascade,
  article_id uuid not null references public.articles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, article_id)
);

create table if not exists public.bookmarks (
  user_id uuid not null references public.users(id) on delete cascade,
  article_id uuid not null references public.articles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, article_id)
);

create table if not exists public.follows (
  follower_id uuid not null references public.users(id) on delete cascade,
  following_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create table if not exists public.glossary (
  id uuid primary key default gen_random_uuid(),
  term text not null unique,
  definition text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.user_glossary (
  user_id uuid not null references public.users(id) on delete cascade,
  glossary_id uuid not null references public.glossary(id) on delete cascade,
  saved_at timestamptz not null default now(),
  primary key (user_id, glossary_id)
);

create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  block_id uuid references public.article_blocks(id) on delete set null,
  title text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  prompt text not null,
  position integer not null check (position >= 0),
  unique (quiz_id, position)
);

create table if not exists public.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  answer text not null,
  is_correct boolean not null default false,
  explanation text,
  position integer not null check (position >= 0),
  unique (question_id, position)
);

create table if not exists public.article_revisions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  content_json jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists articles_publication_idx on public.articles(status, published_at desc);
create index if not exists articles_owner_updated_idx on public.articles(user_id, updated_at desc);
create index if not exists article_blocks_order_idx on public.article_blocks(article_id, position);
create index if not exists comments_article_created_idx on public.comments(article_id, created_at);

alter table public.users enable row level security;
alter table public.categories enable row level security;
alter table public.articles enable row level security;
alter table public.article_blocks enable row level security;
alter table public.tags enable row level security;
alter table public.article_tags enable row level security;
alter table public.comments enable row level security;
alter table public.likes enable row level security;
alter table public.bookmarks enable row level security;
alter table public.follows enable row level security;
alter table public.glossary enable row level security;
alter table public.user_glossary enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_answers enable row level security;
alter table public.article_revisions enable row level security;

create policy "Profiles are publicly readable" on public.users for select using (true);
create policy "Users manage their own profile" on public.users for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "Categories are publicly readable" on public.categories for select using (true);
create policy "Tags are publicly readable" on public.tags for select using (true);
create policy "Signed-in users may create tags" on public.tags for insert with check (auth.uid() is not null);
create policy "Published articles or owned articles are readable" on public.articles for select using (status = 'published' or auth.uid() = user_id);
create policy "Users create their own articles" on public.articles for insert with check (auth.uid() = user_id);
create policy "Users update their own articles" on public.articles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users delete their own articles" on public.articles for delete using (auth.uid() = user_id);

create policy "Blocks readable with article" on public.article_blocks for select using (
  exists (select 1 from public.articles a where a.id = article_id and (a.status = 'published' or a.user_id = auth.uid()))
);
create policy "Owners manage article blocks" on public.article_blocks for all using (
  exists (select 1 from public.articles a where a.id = article_id and a.user_id = auth.uid())
) with check (
  exists (select 1 from public.articles a where a.id = article_id and a.user_id = auth.uid())
);
create policy "Article tags readable with article" on public.article_tags for select using (
  exists (select 1 from public.articles a where a.id = article_id and (a.status = 'published' or a.user_id = auth.uid()))
);
create policy "Owners manage article tags" on public.article_tags for all using (
  exists (select 1 from public.articles a where a.id = article_id and a.user_id = auth.uid())
) with check (
  exists (select 1 from public.articles a where a.id = article_id and a.user_id = auth.uid())
);

create policy "Comments on published articles are readable" on public.comments for select using (
  exists (select 1 from public.articles a where a.id = article_id and a.status = 'published')
);
create policy "Signed-in users comment on published articles" on public.comments for insert with check (
  auth.uid() = user_id and exists (select 1 from public.articles a where a.id = article_id and a.status = 'published')
);
create policy "Comment authors may edit comments" on public.comments for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Comment authors or article owners may delete comments" on public.comments for delete using (
  auth.uid() = user_id or exists (select 1 from public.articles a where a.id = article_id and a.user_id = auth.uid())
);
create policy "Likes are publicly readable" on public.likes for select using (true);
create policy "Users manage their likes" on public.likes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Bookmarks are private to owner" on public.bookmarks for select using (auth.uid() = user_id);
create policy "Users manage their bookmarks" on public.bookmarks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Follows are publicly readable" on public.follows for select using (true);
create policy "Users manage their follows" on public.follows for all using (auth.uid() = follower_id) with check (auth.uid() = follower_id);
create policy "Glossary is publicly readable" on public.glossary for select using (true);
create policy "User glossary is private to owner" on public.user_glossary for select using (auth.uid() = user_id);
create policy "Users manage saved glossary terms" on public.user_glossary for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Quiz on published articles is readable" on public.quizzes for select using (
  exists (select 1 from public.articles a where a.id = article_id and a.status = 'published')
);
create policy "Owners manage quizzes" on public.quizzes for all using (
  exists (select 1 from public.articles a where a.id = article_id and a.user_id = auth.uid())
) with check (
  exists (select 1 from public.articles a where a.id = article_id and a.user_id = auth.uid())
);
create policy "Questions readable with published quiz" on public.quiz_questions for select using (
  exists (select 1 from public.quizzes q join public.articles a on a.id = q.article_id where q.id = quiz_id and a.status = 'published')
);
create policy "Quiz owners manage questions" on public.quiz_questions for all using (
  exists (select 1 from public.quizzes q join public.articles a on a.id = q.article_id where q.id = quiz_id and a.user_id = auth.uid())
) with check (
  exists (select 1 from public.quizzes q join public.articles a on a.id = q.article_id where q.id = quiz_id and a.user_id = auth.uid())
);
create policy "Answers readable with published quiz" on public.quiz_answers for select using (
  exists (select 1 from public.quiz_questions qq join public.quizzes q on q.id = qq.quiz_id join public.articles a on a.id = q.article_id where qq.id = question_id and a.status = 'published')
);
create policy "Quiz owners manage answers" on public.quiz_answers for all using (
  exists (select 1 from public.quiz_questions qq join public.quizzes q on q.id = qq.quiz_id join public.articles a on a.id = q.article_id where qq.id = question_id and a.user_id = auth.uid())
) with check (
  exists (select 1 from public.quiz_questions qq join public.quizzes q on q.id = qq.quiz_id join public.articles a on a.id = q.article_id where qq.id = question_id and a.user_id = auth.uid())
);
create policy "Article owners read revisions" on public.article_revisions for select using (auth.uid() = user_id);
create policy "Article owners create revisions" on public.article_revisions for insert with check (
  auth.uid() = user_id and exists (select 1 from public.articles a where a.id = article_id and a.user_id = auth.uid())
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('article-images', 'article-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy "Article images are publicly readable" on storage.objects for select using (bucket_id = 'article-images');
create policy "Users upload images to their own folder" on storage.objects for insert with check (
  bucket_id = 'article-images' and auth.uid()::text = (storage.foldername(name))[1]
);
create policy "Users may delete their own article images" on storage.objects for delete using (
  bucket_id = 'article-images' and auth.uid()::text = (storage.foldername(name))[1]
);
