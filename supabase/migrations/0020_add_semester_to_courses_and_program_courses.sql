-- Migration 0020_add_semester_to_courses_and_program_courses.sql
-- Add semester column to courses and program_courses

-- 1. Add semester to courses (optional default semester, 1 to 8)
alter table if exists public.courses
  add column if not exists semester int check (semester is null or (semester between 1 and 8));

-- 2. Add semester to program_courses (the exact semester this course is taught under this program)
alter table if exists public.program_courses
  add column if not exists semester int check (semester is null or (semester between 1 and 8));

-- 3. Update unique constraint on program_courses if needed to include semester
-- We can allow a course in different semesters or keep (program_id, course_id, semester)
alter table if exists public.program_courses
  drop constraint if exists program_courses_program_id_course_id_key;

alter table if exists public.program_courses
  add constraint program_courses_program_course_sem_key unique (program_id, course_id, semester);

