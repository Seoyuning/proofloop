-- 약점 기반 맞춤 연습문제 기능.
-- problem_bank: AI Hub 수학 문제풀이 데이터(few-shot 출제 참고용, 로컬 스크립트로 적재)
-- practice_sets: 학생에게 생성해 준 연습문제 묶음
-- practice_attempts: 학생의 풀이 답안 + AI 채점 결과 (숙달 루프)
-- Supabase SQL Editor에서 실행. 재실행 안전.

-- =========================================================================
-- problem_bank : 출제 참고용 문제 은행 (개인정보 없음, 인증 사용자 읽기 허용)
-- 적재는 service_role 키를 쓰는 로컬 스크립트로만 한다(RLS 우회).
-- =========================================================================
create table if not exists public.problem_bank (
  id uuid primary key default gen_random_uuid(),
  source_name text unique,            -- 예: S3_초등_4_007351 (중복 적재 방지)
  school text,                        -- 초등학교 | 중학교 | 고등학교
  grade text,                         -- "4학년"
  grade_key text,                     -- 정규화 학년키: 초3 / 중1 / 고1
  semester text,
  subject text not null default '수학',
  problem_type text,                  -- 객관식 | 주관식
  difficulty text,                    -- 하 | 중 | 상
  standard_code text,                 -- 성취기준 코드 [4수01-15]
  standard_text text,                 -- 성취기준 설명
  question_text text,
  answer_text text,
  solution_text text,
  created_at timestamptz not null default now()
);

create index if not exists problem_bank_gradekey_idx on public.problem_bank (grade_key);
create index if not exists problem_bank_subject_idx on public.problem_bank (subject);

alter table public.problem_bank enable row level security;

drop policy if exists "problem_bank_read_auth" on public.problem_bank;
create policy "problem_bank_read_auth"
  on public.problem_bank for select
  to authenticated
  using (true);

-- =========================================================================
-- practice_sets : 학생에게 생성한 연습문제 묶음
-- items jsonb 예: [{ "type":"주관식","question":"...","choices":["..."],"answer":"...","solution":"..." }]
-- =========================================================================
create table if not exists public.practice_sets (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id),
  session_id uuid references public.chat_sessions(id) on delete set null,
  concept text,
  grade_key text,
  source text not null default 'auto' check (source in ('auto', 'manual')),
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists practice_sets_class_idx on public.practice_sets (class_id);
create index if not exists practice_sets_student_idx on public.practice_sets (student_id);

alter table public.practice_sets enable row level security;

drop policy if exists "practice_sets_student_rw" on public.practice_sets;
create policy "practice_sets_student_rw"
  on public.practice_sets for select
  using (auth.uid() = student_id);

drop policy if exists "practice_sets_student_insert" on public.practice_sets;
create policy "practice_sets_student_insert"
  on public.practice_sets for insert
  with check (auth.uid() = student_id);

drop policy if exists "practice_sets_teacher_read" on public.practice_sets;
create policy "practice_sets_teacher_read"
  on public.practice_sets for select
  using (exists (select 1 from public.classes c where c.id = practice_sets.class_id and c.teacher_id = auth.uid()));

-- =========================================================================
-- practice_attempts : 학생 답안 + AI 채점 (숙달 루프 / 교사 분석)
-- =========================================================================
create table if not exists public.practice_attempts (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.practice_sets(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id),
  item_index int not null,
  concept text,
  student_answer text,
  is_correct boolean,
  feedback text,
  created_at timestamptz not null default now()
);

create index if not exists practice_attempts_class_idx on public.practice_attempts (class_id);
create index if not exists practice_attempts_set_idx on public.practice_attempts (set_id);

alter table public.practice_attempts enable row level security;

drop policy if exists "practice_attempts_student_read" on public.practice_attempts;
create policy "practice_attempts_student_read"
  on public.practice_attempts for select
  using (auth.uid() = student_id);

drop policy if exists "practice_attempts_student_insert" on public.practice_attempts;
create policy "practice_attempts_student_insert"
  on public.practice_attempts for insert
  with check (auth.uid() = student_id);

drop policy if exists "practice_attempts_teacher_read" on public.practice_attempts;
create policy "practice_attempts_teacher_read"
  on public.practice_attempts for select
  using (exists (select 1 from public.classes c where c.id = practice_attempts.class_id and c.teacher_id = auth.uid()));
