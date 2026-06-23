-- RAG: 선생님이 올린 학습자료를 근거로 챗봇이 답하기 위한 스키마.
-- pgvector 확장 + 자료(class_materials) + 청크(material_chunks) + 벡터 검색 RPC.
-- Supabase SQL Editor에서 실행하세요. 재실행 안전(if not exists / create or replace).

-- =========================================================================
-- pgvector 확장 (임베딩 벡터 저장/검색)
-- =========================================================================
create extension if not exists vector;

-- =========================================================================
-- class_materials: 반별 업로드 학습자료(파일/사진) 메타데이터
-- =========================================================================
create table if not exists public.class_materials (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id),
  title text not null,
  source_kind text not null default 'file' check (source_kind in ('file', 'image')),
  page_count int,
  chunk_count int not null default 0,
  parse_mode text,            -- 'live_ai' | 'demo_ai' (Document Parse 모드)
  created_at timestamptz not null default now()
);

alter table public.class_materials enable row level security;

-- 읽기: 반 담임 교사 + 그 반에 속한 학생
drop policy if exists "materials_select_class" on public.class_materials;
create policy "materials_select_class"
  on public.class_materials for select
  using (
    exists (select 1 from public.classes c where c.id = class_materials.class_id and c.teacher_id = auth.uid())
    or exists (select 1 from public.class_members cm where cm.class_id = class_materials.class_id and cm.student_id = auth.uid())
  );

-- 쓰기/삭제: 반 담임 교사만
drop policy if exists "materials_insert_teacher" on public.class_materials;
create policy "materials_insert_teacher"
  on public.class_materials for insert
  with check (
    teacher_id = auth.uid()
    and exists (select 1 from public.classes c where c.id = class_materials.class_id and c.teacher_id = auth.uid())
  );

drop policy if exists "materials_update_teacher" on public.class_materials;
create policy "materials_update_teacher"
  on public.class_materials for update
  using (exists (select 1 from public.classes c where c.id = class_materials.class_id and c.teacher_id = auth.uid()));

drop policy if exists "materials_delete_teacher" on public.class_materials;
create policy "materials_delete_teacher"
  on public.class_materials for delete
  using (exists (select 1 from public.classes c where c.id = class_materials.class_id and c.teacher_id = auth.uid()));

-- =========================================================================
-- material_chunks: 자료를 잘게 쪼갠 조각 + 임베딩 벡터
-- (임베딩 차원을 모델에 의존하지 않도록 typmod 없는 vector 사용 — 같은 모델로
--  적재/질의하면 차원이 일치한다. 데이터가 작아 인덱스 없이 정확 검색.)
-- =========================================================================
create table if not exists public.material_chunks (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.class_materials(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  ordinal int not null default 0,
  page int,
  content text not null,
  embedding vector not null,
  created_at timestamptz not null default now()
);

create index if not exists material_chunks_class_idx on public.material_chunks (class_id);
create index if not exists material_chunks_material_idx on public.material_chunks (material_id);

alter table public.material_chunks enable row level security;

-- 읽기: 반 담임 교사 + 그 반 학생 (챗봇이 학생 세션으로 검색하므로 학생 read 필수)
drop policy if exists "chunks_select_class" on public.material_chunks;
create policy "chunks_select_class"
  on public.material_chunks for select
  using (
    exists (select 1 from public.classes c where c.id = material_chunks.class_id and c.teacher_id = auth.uid())
    or exists (select 1 from public.class_members cm where cm.class_id = material_chunks.class_id and cm.student_id = auth.uid())
  );

-- 쓰기/삭제: 반 담임 교사만 (적재는 교사 세션으로 수행)
drop policy if exists "chunks_insert_teacher" on public.material_chunks;
create policy "chunks_insert_teacher"
  on public.material_chunks for insert
  with check (exists (select 1 from public.classes c where c.id = material_chunks.class_id and c.teacher_id = auth.uid()));

drop policy if exists "chunks_delete_teacher" on public.material_chunks;
create policy "chunks_delete_teacher"
  on public.material_chunks for delete
  using (exists (select 1 from public.classes c where c.id = material_chunks.class_id and c.teacher_id = auth.uid()));

-- =========================================================================
-- 벡터 검색 RPC: 질문 임베딩과 가장 가까운 청크 top-k 반환
-- SECURITY INVOKER(기본) → 호출자(학생/교사) RLS가 그대로 적용되어
-- 자기 반 자료만 조회된다. (코사인 거리 <=>)
-- =========================================================================
create or replace function public.match_material_chunks(
  p_class_id uuid,
  query_embedding vector,
  match_count int default 5
)
returns table (
  id uuid,
  material_id uuid,
  title text,
  content text,
  page int,
  similarity float
)
language sql
stable
as $$
  select
    mc.id,
    mc.material_id,
    cm.title,
    mc.content,
    mc.page,
    1 - (mc.embedding <=> query_embedding) as similarity
  from public.material_chunks mc
  join public.class_materials cm on cm.id = mc.material_id
  where mc.class_id = p_class_id
  order by mc.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;
