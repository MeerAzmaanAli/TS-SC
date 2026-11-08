-- Migration 0016: Add L-T-P (Lectures, Tutorials, Practicals) breakdown to courses
-- L: Lectures per week
-- T: Tutorials per week
-- P: Practicals / Lab hours per week

alter table if exists public.courses
  add column if not exists lectures_per_week int not null default 0 check (lectures_per_week >= 0),
  add column if not exists tutorials_per_week int not null default 0 check (tutorials_per_week >= 0),
  add column if not exists practicals_per_week int not null default 0 check (practicals_per_week >= 0);

-- Backfill existing courses if L-T-P is zero
-- If lab_required is true: practicals_per_week = sessions_per_week, lectures = 0
-- If lab_required is false: lectures_per_week = sessions_per_week, practicals = 0
update public.courses
set lectures_per_week = case when lab_required then 0 else sessions_per_week end,
    tutorials_per_week = 0,
    practicals_per_week = case when lab_required then sessions_per_week else 0 end
where lectures_per_week = 0 and practicals_per_week = 0;

