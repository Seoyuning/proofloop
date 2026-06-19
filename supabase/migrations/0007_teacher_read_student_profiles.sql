-- 교사가 자기 반에 속한 학생의 프로필(이름 등)을 조회할 수 있도록 허용.
-- 기존엔 profiles_select_own(본인 것만) 정책뿐이라, 교사가 학생 이름을 못 읽어
-- 분석/학생목록/학기리포트에서 모두 "이름 없음"으로 표시되던 문제를 해결한다.
-- (SELECT 정책은 OR로 합쳐지므로 기존 본인 조회 정책과 공존)
-- Supabase SQL Editor에서 실행하세요.

drop policy if exists "profiles_select_class_members" on public.profiles;
create policy "profiles_select_class_members"
  on public.profiles for select
  using (
    exists (
      select 1
      from public.class_members cm
      join public.classes c on c.id = cm.class_id
      where cm.student_id = profiles.id
        and c.teacher_id = auth.uid()
    )
  );
