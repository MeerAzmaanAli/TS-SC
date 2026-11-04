-- Migration: 0013_program_courses.sql
-- Transition course curriculum mapping from individual sections to programs.
-- All sections belonging to a program share the exact same curriculum courses.

create table if not exists public.program_courses (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  sessions_per_week int check (sessions_per_week is null or sessions_per_week > 0),
  created_at timestamptz not null default now(),
  unique (program_id, course_id)
);

-- Enable Row Level Security
alter table public.program_courses enable row level security;

-- Policies for program_courses
create policy "admin_all_program_courses" on public.program_courses
  for all using (public.is_admin()) with check (public.is_admin());

create policy "authenticated_read_program_courses" on public.program_courses
  for select using (auth.uid() is not null);

-- Populate existing distinct courses from section_courses into program_courses
insert into public.program_courses (program_id, course_id, sessions_per_week)
select distinct
  s.program_id,
  sc.course_id,
  sc.sessions_per_week
from public.section_courses sc
join public.sections s on s.id = sc.section_id
where s.program_id is not null
on conflict (program_id, course_id) do nothing;

