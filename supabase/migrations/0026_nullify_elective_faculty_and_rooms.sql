-- Migration 0026: Policy Enforcer: Generic Electives have no assigned faculty or classroom
-- In accordance with institutional policy, Generic Electives are open student-choice courses;
-- no departmental faculty member or classroom is booked for them.

-- 1. Ensure columns are nullable (idempotent)
alter table if exists public.timetable_entries
  alter column room_id drop not null,
  alter column faculty_id drop not null;

-- 2. Clean up existing timetable entries so Generic Electives no longer bind to faculty (e.g. Dr. Rohan Sharma) or classrooms
update public.timetable_entries
set faculty_id = null,
    room_id = null
where is_elective = true;

