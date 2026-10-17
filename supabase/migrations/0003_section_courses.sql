-- TS-SC: section↔course mapping + elective flag (Phase 3)
--
-- The solver needs to know which courses each section takes. A section
-- takes a subset of its department's courses; sessions_per_week may be
-- overridden per section (NULL falls back to courses.sessions_per_week).

create table section_courses (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references sections(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  sessions_per_week int check (sessions_per_week > 0),
  created_at timestamptz not null default now(),
  unique (section_id, course_id)
);

-- Marks courses scheduled exclusively inside elective slot-blocks.
alter table courses add column is_elective boolean not null default false;

alter table section_courses enable row level security;

create policy "admin_all" on public.section_courses
  for all using (public.is_admin()) with check (public.is_admin());
create policy "authenticated_read" on public.section_courses
  for select using (auth.uid() is not null);
