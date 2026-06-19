-- 반(클래스) 테이블
create table if not exists classes (
  id uuid default gen_random_uuid() primary key,
  teacher_id uuid references profiles(id) not null,
  name text not null,
  school text,
  subject text not null,
  grade text not null,
  publisher text not null,
  textbook_name text not null,
  invite_code text unique not null,
  max_students int default 35,
  created_at timestamptz default now()
);

-- 반 멤버(학생) 테이블
create table if not exists class_members (
  id uuid default gen_random_uuid() primary key,
  class_id uuid references classes(id) on delete cascade not null,
  student_id uuid references profiles(id) not null,
  joined_at timestamptz default now(),
  unique(class_id, student_id)
);

-- 학생 질문 기록 테이블
create table if not exists student_questions (
  id uuid default gen_random_uuid() primary key,
  class_id uuid references classes(id) on delete cascade not null,
  student_id uuid references profiles(id) not null,
  question text not null,
  section_title text,
  misconception text,
  understanding_level int,
  created_at timestamptz default now()
);

-- RLS 활성화
alter table classes enable row level security;
alter table class_members enable row level security;
alter table student_questions enable row level security;

-- classes 정책
create policy "Anyone can read classes" on classes for select using (true);
create policy "Teachers can create classes" on classes for insert with check (
  auth.uid() = teacher_id
);
create policy "Teachers can update own classes" on classes for update using (
  auth.uid() = teacher_id
);

-- class_members 정책
create policy "Anyone can read class members" on class_members for select using (true);
create policy "Students can join" on class_members for insert with check (
  auth.uid() = student_id
);

-- student_questions 정책
create policy "Anyone can read questions" on student_questions for select using (true);
create policy "Students can insert questions" on student_questions for insert with check (
  auth.uid() = student_id
);
