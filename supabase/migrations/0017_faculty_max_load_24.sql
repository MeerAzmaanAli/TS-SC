-- Migration 0017: Set faculty max weekly load to 24 hours/week
-- and make room_id and faculty_id nullable in timetable_entries for electives / independent activities

alter table if exists public.faculty
  alter column max_weekly_load set default 24;

update public.faculty
set max_weekly_load = 24
where max_weekly_load != 999;

-- Allow electives or unassigned lab rooms to have null room_id / faculty_id without constraint failure
alter table if exists public.timetable_entries
  alter column room_id drop not null,
  alter column faculty_id drop not null;

