-- ===========================================================================
-- TS-SC: Institutional Large-Scale Seed Script (Dual-Shift University Model)
-- Scope: 75 Sections | 101 Rooms | 100 Faculty | 112 Courses | 40 Time Slots
-- Shifts: Year 1 & 4 -> Shift 1 (08:15-14:45) | Year 2 & 3 -> Shift 2 (10:15-16:45)
-- Common Lunch: 12:15 to 12:45
-- ===========================================================================

-- Step 1: Ensure columns from migrations 0001-0015 exist
alter table if exists sections
  add column if not exists batch_count int not null default 1 check (batch_count >= 1),
  add column if not exists code text unique,
  add column if not exists passkey text not null default substring(md5(random()::text), 1, 6),
  add column if not exists shift int not null default 1 check (shift in (1, 2)),
  add column if not exists academic_year int default 1 check (academic_year between 1 and 4);

alter table if exists courses
  add column if not exists is_elective boolean not null default false,
  add column if not exists lectures_per_week int not null default 0,
  add column if not exists tutorials_per_week int not null default 0,
  add column if not exists practicals_per_week int not null default 0;

alter table if exists timetable_versions
  add column if not exists violations jsonb not null default '{}';

alter table if exists timetable_entries
  add column if not exists batch int default null check (batch is null or batch >= 1),
  alter column room_id drop not null,
  alter column faculty_id drop not null;

alter table if exists faculty
  alter column max_weekly_load set default 24;

create table if not exists academic_year_shifts (
  institution_id uuid not null references institutions(id) on delete cascade,
  academic_year int not null check (academic_year between 1 and 4),
  shift int not null check (shift in (1, 2)),
  timing_label text not null,
  starts_at time not null,
  ends_at time not null,
  updated_at timestamptz not null default now(),
  primary key (institution_id, academic_year)
);

-- Step 2: Wipe all previous data & seed freshly in a single atomic transaction
do $$
declare
  v_inst uuid;
  v_dept_cse uuid; v_dept_aids uuid; v_dept_it uuid; v_dept_ind uuid;
  v_prog uuid;
  
begin
  -- Unlink foreign keys from profiles so existing user auth logins remain intact
  update profiles set section_id = null, faculty_id = null;

  -- Wipe previous transactional, operational, and scheduling data
  delete from substitution_penalties;
  delete from substitution_candidates;
  delete from substitution_requests;
  delete from timetable_entries;
  delete from timetable_versions;

  -- Wipe previous mappings & constraints
  delete from section_courses;
  if exists (select 1 from information_schema.tables where table_name = 'program_courses') then
    delete from program_courses;
  end if;
  delete from faculty_qualifications;
  delete from elective_slot_blocks;
  delete from constraints;
  delete from time_slots;
  delete from academic_year_shifts;

  -- Wipe previous core entities
  delete from courses;
  delete from rooms;
  delete from sections;
  delete from programs;
  delete from departments;
  delete from faculty;
  delete from institutions;

  -- -------------------------------------------------------------------------
  -- 1. Institution & Departments
  -- -------------------------------------------------------------------------
  insert into institutions (name) values ('Institute of Engineering & Technology') returning id into v_inst;
  insert into departments (institution_id, name) values (v_inst, 'Computer Science & Engineering') returning id into v_dept_cse;
  insert into departments (institution_id, name) values (v_inst, 'Artificial Intelligence & Data Science') returning id into v_dept_aids;
  insert into departments (institution_id, name) values (v_inst, 'Information Technology') returning id into v_dept_it;
  insert into departments (institution_id, name) values (v_inst, 'Industry Integrated Programs (TCS/IBM/Apple)') returning id into v_dept_ind;

  -- -------------------------------------------------------------------------
  -- 2. Academic Year Shifts (Admin Configurable)
  -- -------------------------------------------------------------------------
  insert into academic_year_shifts (institution_id, academic_year, shift, timing_label, starts_at, ends_at)
  values (v_inst, 1, 1, 'First Shift (08:15 - 14:45)', '08:15:00', '14:45:00');
  insert into academic_year_shifts (institution_id, academic_year, shift, timing_label, starts_at, ends_at)
  values (v_inst, 2, 2, 'Second Shift (10:15 - 16:45)', '10:15:00', '16:45:00');
  insert into academic_year_shifts (institution_id, academic_year, shift, timing_label, starts_at, ends_at)
  values (v_inst, 3, 2, 'Second Shift (10:15 - 16:45)', '10:15:00', '16:45:00');
  insert into academic_year_shifts (institution_id, academic_year, shift, timing_label, starts_at, ends_at)
  values (v_inst, 4, 1, 'First Shift (08:15 - 14:45)', '08:15:00', '14:45:00');

  -- -------------------------------------------------------------------------
  -- 3. Time Slots (5 Days x 8 Periods with Common Lunch 12:15-12:45)
  -- -------------------------------------------------------------------------
  insert into time_slots (institution_id, day_of_week, period, starts_at, ends_at)
  values (v_inst, 1, 1, '08:15:00', '09:15:00');
  insert into time_slots (institution_id, day_of_week, period, starts_at, ends_at)
  values (v_inst, 1, 2, '09:15:00', '10:15:00');
  insert into time_slots (institution_id, day_of_week, period, starts_at, ends_at)
  values (v_inst, 1, 3, '10:15:00', '11:15:00');
  insert into time_slots (institution_id, day_of_week, period, starts_at, ends_at)
  values (v_inst, 1, 4, '11:15:00', '12:15:00');
  insert into time_slots (institution_id, day_of_week, period, starts_at, ends_at)
  values (v_inst, 1, 5, '12:45:00', '13:45:00');
  insert into time_slots (institution_id, day_of_week, period, starts_at, ends_at)
  values (v_inst, 1, 6, '13:45:00', '14:45:00');
  insert into time_slots (institution_id, day_of_week, period, starts_at, ends_at)
  values (v_inst, 1, 7, '14:45:00', '15:45:00');
  insert into time_slots (institution_id, day_of_week, period, starts_at, ends_at)
  values (v_inst, 1, 8, '15:45:00', '16:45:00');
  insert into time_slots (institution_id, day_of_week, period, starts_at, ends_at)
  values (v_inst, 2, 1, '08:15:00', '09:15:00');
  insert into time_slots (institution_id, day_of_week, period, starts_at, ends_at)
  values (v_inst, 2, 2, '09:15:00', '10:15:00');
  insert into time_slots (institution_id, day_of_week, period, starts_at, ends_at)
  values (v_inst, 2, 3, '10:15:00', '11:15:00');
  insert into time_slots (institution_id, day_of_week, period, starts_at, ends_at)
  values (v_inst, 2, 4, '11:15:00', '12:15:00');
  insert into time_slots (institution_id, day_of_week, period, starts_at, ends_at)
  values (v_inst, 2, 5, '12:45:00', '13:45:00');
  insert into time_slots (institution_id, day_of_week, period, starts_at, ends_at)
  values (v_inst, 2, 6, '13:45:00', '14:45:00');
  insert into time_slots (institution_id, day_of_week, period, starts_at, ends_at)
  values (v_inst, 2, 7, '14:45:00', '15:45:00');
  insert into time_slots (institution_id, day_of_week, period, starts_at, ends_at)
  values (v_inst, 2, 8, '15:45:00', '16:45:00');
  insert into time_slots (institution_id, day_of_week, period, starts_at, ends_at)
  values (v_inst, 3, 1, '08:15:00', '09:15:00');
  insert into time_slots (institution_id, day_of_week, period, starts_at, ends_at)
  values (v_inst, 3, 2, '09:15:00', '10:15:00');
  insert into time_slots (institution_id, day_of_week, period, starts_at, ends_at)
  values (v_inst, 3, 3, '10:15:00', '11:15:00');
  insert into time_slots (institution_id, day_of_week, period, starts_at, ends_at)
  values (v_inst, 3, 4, '11:15:00', '12:15:00');
  insert into time_slots (institution_id, day_of_week, period, starts_at, ends_at)
  values (v_inst, 3, 5, '12:45:00', '13:45:00');
  insert into time_slots (institution_id, day_of_week, period, starts_at, ends_at)
  values (v_inst, 3, 6, '13:45:00', '14:45:00');
  insert into time_slots (institution_id, day_of_week, period, starts_at, ends_at)
  values (v_inst, 3, 7, '14:45:00', '15:45:00');
  insert into time_slots (institution_id, day_of_week, period, starts_at, ends_at)
  values (v_inst, 3, 8, '15:45:00', '16:45:00');
  insert into time_slots (institution_id, day_of_week, period, starts_at, ends_at)
  values (v_inst, 4, 1, '08:15:00', '09:15:00');
  insert into time_slots (institution_id, day_of_week, period, starts_at, ends_at)
  values (v_inst, 4, 2, '09:15:00', '10:15:00');
  insert into time_slots (institution_id, day_of_week, period, starts_at, ends_at)
  values (v_inst, 4, 3, '10:15:00', '11:15:00');
  insert into time_slots (institution_id, day_of_week, period, starts_at, ends_at)
  values (v_inst, 4, 4, '11:15:00', '12:15:00');
  insert into time_slots (institution_id, day_of_week, period, starts_at, ends_at)
  values (v_inst, 4, 5, '12:45:00', '13:45:00');
  insert into time_slots (institution_id, day_of_week, period, starts_at, ends_at)
  values (v_inst, 4, 6, '13:45:00', '14:45:00');
  insert into time_slots (institution_id, day_of_week, period, starts_at, ends_at)
  values (v_inst, 4, 7, '14:45:00', '15:45:00');
  insert into time_slots (institution_id, day_of_week, period, starts_at, ends_at)
  values (v_inst, 4, 8, '15:45:00', '16:45:00');
  insert into time_slots (institution_id, day_of_week, period, starts_at, ends_at)
  values (v_inst, 5, 1, '08:15:00', '09:15:00');
  insert into time_slots (institution_id, day_of_week, period, starts_at, ends_at)
  values (v_inst, 5, 2, '09:15:00', '10:15:00');
  insert into time_slots (institution_id, day_of_week, period, starts_at, ends_at)
  values (v_inst, 5, 3, '10:15:00', '11:15:00');
  insert into time_slots (institution_id, day_of_week, period, starts_at, ends_at)
  values (v_inst, 5, 4, '11:15:00', '12:15:00');
  insert into time_slots (institution_id, day_of_week, period, starts_at, ends_at)
  values (v_inst, 5, 5, '12:45:00', '13:45:00');
  insert into time_slots (institution_id, day_of_week, period, starts_at, ends_at)
  values (v_inst, 5, 6, '13:45:00', '14:45:00');
  insert into time_slots (institution_id, day_of_week, period, starts_at, ends_at)
  values (v_inst, 5, 7, '14:45:00', '15:45:00');
  insert into time_slots (institution_id, day_of_week, period, starts_at, ends_at)
  values (v_inst, 5, 8, '15:45:00', '16:45:00');

  -- -------------------------------------------------------------------------
  -- 4. Rooms (81 Classrooms + 20 Labs = 101 Rooms)
  -- -------------------------------------------------------------------------
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-101', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-102', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-103', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-104', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-105', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-106', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-107', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-108', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-109', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-110', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-111', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-112', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-113', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-114', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-115', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-116', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-117', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-118', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-201', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-202', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-203', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-204', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-205', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-206', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-207', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-208', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-209', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-210', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-211', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-212', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-213', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-214', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-215', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-216', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-217', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-218', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-301', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-302', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-303', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-304', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-305', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-306', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-307', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-308', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-309', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-310', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-311', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-312', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-313', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-314', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-315', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'MB-316', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'ME-101', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'ME-102', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'ME-103', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'ME-104', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'ME-105', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'ME-106', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'ME-107', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'ME-108', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'CE-101', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'CE-102', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'CE-103', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'CE-104', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'CE-105', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'CE-106', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'CE-107', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'CE-108', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'TE-101', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'TE-102', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'TE-103', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'TE-104', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'EE-101', 'classroom', 70);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'LAB-01', 'lab', 35);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'LAB-02', 'lab', 35);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'LAB-03', 'lab', 35);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'LAB-04', 'lab', 35);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'LAB-05', 'lab', 35);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'LAB-06', 'lab', 35);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'LAB-07', 'lab', 35);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'LAB-08', 'lab', 35);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'LAB-09', 'lab', 35);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'LAB-10', 'lab', 35);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'LAB-11', 'lab', 35);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'LAB-12', 'lab', 35);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'LAB-13', 'lab', 35);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'LAB-14', 'lab', 35);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'LAB-15', 'lab', 35);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'LAB-16', 'lab', 35);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'LAB-17', 'lab', 35);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'LAB-18', 'lab', 35);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'LAB-19', 'lab', 35);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'LAB-20', 'lab', 35);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'LAB-21', 'lab', 35);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'LAB-22', 'lab', 35);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'LAB-23', 'lab', 35);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'LAB-24', 'lab', 35);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'LAB-25', 'lab', 35);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'LAB-26', 'lab', 35);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'LAB-27', 'lab', 35);
  insert into rooms (institution_id, name, room_type, capacity)
  values (v_inst, 'LAB-28', 'lab', 35);

  -- -------------------------------------------------------------------------
  -- 5. Academic Programs (4 Programs x 4 Years)
  -- -------------------------------------------------------------------------
  insert into programs (id, department_id, name) values ('10000000-0000-0000-0000-000000000001', v_dept_cse, 'B.Tech CSE Year 1');
  insert into programs (id, department_id, name) values ('10000000-0000-0000-0000-000000000002', v_dept_cse, 'B.Tech CSE Year 2');
  insert into programs (id, department_id, name) values ('10000000-0000-0000-0000-000000000003', v_dept_cse, 'B.Tech CSE Year 3');
  insert into programs (id, department_id, name) values ('10000000-0000-0000-0000-000000000004', v_dept_cse, 'B.Tech CSE Year 4');
  insert into programs (id, department_id, name) values ('20000000-0000-0000-0000-000000000001', v_dept_aids, 'B.Tech AI-DS Year 1');
  insert into programs (id, department_id, name) values ('20000000-0000-0000-0000-000000000002', v_dept_aids, 'B.Tech AI-DS Year 2');
  insert into programs (id, department_id, name) values ('20000000-0000-0000-0000-000000000003', v_dept_aids, 'B.Tech AI-DS Year 3');
  insert into programs (id, department_id, name) values ('20000000-0000-0000-0000-000000000004', v_dept_aids, 'B.Tech AI-DS Year 4');
  insert into programs (id, department_id, name) values ('30000000-0000-0000-0000-000000000001', v_dept_it, 'B.Tech IT Year 1');
  insert into programs (id, department_id, name) values ('30000000-0000-0000-0000-000000000002', v_dept_it, 'B.Tech IT Year 2');
  insert into programs (id, department_id, name) values ('30000000-0000-0000-0000-000000000003', v_dept_it, 'B.Tech IT Year 3');
  insert into programs (id, department_id, name) values ('30000000-0000-0000-0000-000000000004', v_dept_it, 'B.Tech IT Year 4');
  insert into programs (id, department_id, name) values ('40000000-0000-0000-0000-000000000001', v_dept_ind, 'Industry Programs Year 1');
  insert into programs (id, department_id, name) values ('40000000-0000-0000-0000-000000000002', v_dept_ind, 'Industry Programs Year 2');
  insert into programs (id, department_id, name) values ('40000000-0000-0000-0000-000000000003', v_dept_ind, 'Industry Programs Year 3');
  insert into programs (id, department_id, name) values ('40000000-0000-0000-0000-000000000004', v_dept_ind, 'Industry Programs Year 4');

  -- -------------------------------------------------------------------------
  -- 6. Sections (75 Sections with Shifts & Passkeys)
  -- -------------------------------------------------------------------------
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('10000000-0000-0000-0000-000000000001', 'CSE-Y1-A', 1, 1, 1, 60, 2, 'CSE-Y1-A', 'A-DA79');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('10000000-0000-0000-0000-000000000001', 'CSE-Y1-B', 1, 1, 1, 60, 2, 'CSE-Y1-B', 'B-7566');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('10000000-0000-0000-0000-000000000001', 'CSE-Y1-C', 1, 1, 1, 60, 2, 'CSE-Y1-C', 'C-AD61');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('10000000-0000-0000-0000-000000000001', 'CSE-Y1-D', 1, 1, 1, 60, 2, 'CSE-Y1-D', 'D-E1FC');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('10000000-0000-0000-0000-000000000001', 'CSE-Y1-E', 1, 1, 1, 60, 2, 'CSE-Y1-E', 'E-797C');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('10000000-0000-0000-0000-000000000001', 'CSE-Y1-F', 1, 1, 1, 60, 2, 'CSE-Y1-F', 'F-D01E');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('10000000-0000-0000-0000-000000000001', 'CSE-Y1-G', 1, 1, 1, 60, 2, 'CSE-Y1-G', 'G-DE55');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('10000000-0000-0000-0000-000000000001', 'CSE-Y1-H', 1, 1, 1, 60, 2, 'CSE-Y1-H', 'H-B745');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('10000000-0000-0000-0000-000000000002', 'CSE-Y2-A', 3, 2, 2, 60, 2, 'CSE-Y2-A', 'A-B308');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('10000000-0000-0000-0000-000000000002', 'CSE-Y2-B', 3, 2, 2, 60, 2, 'CSE-Y2-B', 'B-75D7');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('10000000-0000-0000-0000-000000000002', 'CSE-Y2-C', 3, 2, 2, 60, 2, 'CSE-Y2-C', 'C-AE7F');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('10000000-0000-0000-0000-000000000002', 'CSE-Y2-D', 3, 2, 2, 60, 2, 'CSE-Y2-D', 'D-3E54');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('10000000-0000-0000-0000-000000000002', 'CSE-Y2-E', 3, 2, 2, 60, 2, 'CSE-Y2-E', 'E-043C');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('10000000-0000-0000-0000-000000000002', 'CSE-Y2-F', 3, 2, 2, 60, 2, 'CSE-Y2-F', 'F-F512');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('10000000-0000-0000-0000-000000000002', 'CSE-Y2-G', 3, 2, 2, 60, 2, 'CSE-Y2-G', 'G-3BA0');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('10000000-0000-0000-0000-000000000002', 'CSE-Y2-H', 3, 2, 2, 60, 2, 'CSE-Y2-H', 'H-4A76');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('10000000-0000-0000-0000-000000000003', 'CSE-Y3-A', 5, 3, 2, 60, 2, 'CSE-Y3-A', 'A-B96D');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('10000000-0000-0000-0000-000000000003', 'CSE-Y3-B', 5, 3, 2, 60, 2, 'CSE-Y3-B', 'B-C93D');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('10000000-0000-0000-0000-000000000003', 'CSE-Y3-C', 5, 3, 2, 60, 2, 'CSE-Y3-C', 'C-232F');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('10000000-0000-0000-0000-000000000003', 'CSE-Y3-D', 5, 3, 2, 60, 2, 'CSE-Y3-D', 'D-3323');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('10000000-0000-0000-0000-000000000003', 'CSE-Y3-E', 5, 3, 2, 60, 2, 'CSE-Y3-E', 'E-9F14');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('10000000-0000-0000-0000-000000000003', 'CSE-Y3-F', 5, 3, 2, 60, 2, 'CSE-Y3-F', 'F-51AC');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('10000000-0000-0000-0000-000000000003', 'CSE-Y3-G', 5, 3, 2, 60, 2, 'CSE-Y3-G', 'G-3E79');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('10000000-0000-0000-0000-000000000003', 'CSE-Y3-H', 5, 3, 2, 60, 2, 'CSE-Y3-H', 'H-C01D');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('10000000-0000-0000-0000-000000000003', 'CSE-Y3-I', 5, 3, 2, 60, 2, 'CSE-Y3-I', 'I-9602');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('10000000-0000-0000-0000-000000000004', 'CSE-Y4-A', 7, 4, 1, 60, 2, 'CSE-Y4-A', 'A-0DB9');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('10000000-0000-0000-0000-000000000004', 'CSE-Y4-B', 7, 4, 1, 60, 2, 'CSE-Y4-B', 'B-290D');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('10000000-0000-0000-0000-000000000004', 'CSE-Y4-C', 7, 4, 1, 60, 2, 'CSE-Y4-C', 'C-D169');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('10000000-0000-0000-0000-000000000004', 'CSE-Y4-D', 7, 4, 1, 60, 2, 'CSE-Y4-D', 'D-C9BF');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('10000000-0000-0000-0000-000000000004', 'CSE-Y4-E', 7, 4, 1, 60, 2, 'CSE-Y4-E', 'E-AC9B');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('10000000-0000-0000-0000-000000000004', 'CSE-Y4-F', 7, 4, 1, 60, 2, 'CSE-Y4-F', 'F-8330');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('10000000-0000-0000-0000-000000000004', 'CSE-Y4-G', 7, 4, 1, 60, 2, 'CSE-Y4-G', 'G-14F7');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('10000000-0000-0000-0000-000000000004', 'CSE-Y4-H', 7, 4, 1, 60, 2, 'CSE-Y4-H', 'H-56BD');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('10000000-0000-0000-0000-000000000004', 'CSE-Y4-I', 7, 4, 1, 60, 2, 'CSE-Y4-I', 'I-5B24');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('10000000-0000-0000-0000-000000000004', 'CSE-Y4-J', 7, 4, 1, 60, 2, 'CSE-Y4-J', 'J-3A62');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('20000000-0000-0000-0000-000000000001', 'AIDS-Y1-A', 1, 1, 1, 60, 2, 'AIDS-Y1-A', 'A-CF8D');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('20000000-0000-0000-0000-000000000001', 'AIDS-Y1-B', 1, 1, 1, 60, 2, 'AIDS-Y1-B', 'B-2339');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('20000000-0000-0000-0000-000000000002', 'AIDS-Y2-A', 3, 2, 2, 60, 2, 'AIDS-Y2-A', 'A-A9C2');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('20000000-0000-0000-0000-000000000002', 'AIDS-Y2-B', 3, 2, 2, 60, 2, 'AIDS-Y2-B', 'B-6F2E');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('20000000-0000-0000-0000-000000000003', 'AIDS-Y3-A', 5, 3, 2, 60, 2, 'AIDS-Y3-A', 'A-68BD');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('20000000-0000-0000-0000-000000000003', 'AIDS-Y3-B', 5, 3, 2, 60, 2, 'AIDS-Y3-B', 'B-6469');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('20000000-0000-0000-0000-000000000004', 'AIDS-Y4-A', 7, 4, 1, 60, 2, 'AIDS-Y4-A', 'A-5766');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('20000000-0000-0000-0000-000000000004', 'AIDS-Y4-B', 7, 4, 1, 60, 2, 'AIDS-Y4-B', 'B-27E9');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('30000000-0000-0000-0000-000000000001', 'IT-Y1-A', 1, 1, 1, 60, 2, 'IT-Y1-A', 'A-1AC5');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('30000000-0000-0000-0000-000000000001', 'IT-Y1-B', 1, 1, 1, 60, 2, 'IT-Y1-B', 'B-D4F3');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('30000000-0000-0000-0000-000000000001', 'IT-Y1-C', 1, 1, 1, 60, 2, 'IT-Y1-C', 'C-D0E8');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('30000000-0000-0000-0000-000000000001', 'IT-Y1-D', 1, 1, 1, 60, 2, 'IT-Y1-D', 'D-4B2D');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('30000000-0000-0000-0000-000000000002', 'IT-Y2-A', 3, 2, 2, 60, 2, 'IT-Y2-A', 'A-CF32');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('30000000-0000-0000-0000-000000000002', 'IT-Y2-B', 3, 2, 2, 60, 2, 'IT-Y2-B', 'B-C155');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('30000000-0000-0000-0000-000000000002', 'IT-Y2-C', 3, 2, 2, 60, 2, 'IT-Y2-C', 'C-A2EB');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('30000000-0000-0000-0000-000000000002', 'IT-Y2-D', 3, 2, 2, 60, 2, 'IT-Y2-D', 'D-A2D2');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('30000000-0000-0000-0000-000000000003', 'IT-Y3-A', 5, 3, 2, 60, 2, 'IT-Y3-A', 'A-652C');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('30000000-0000-0000-0000-000000000003', 'IT-Y3-B', 5, 3, 2, 60, 2, 'IT-Y3-B', 'B-9F9E');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('30000000-0000-0000-0000-000000000003', 'IT-Y3-C', 5, 3, 2, 60, 2, 'IT-Y3-C', 'C-EB32');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('30000000-0000-0000-0000-000000000003', 'IT-Y3-D', 5, 3, 2, 60, 2, 'IT-Y3-D', 'D-96B4');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('30000000-0000-0000-0000-000000000004', 'IT-Y4-A', 7, 4, 1, 60, 2, 'IT-Y4-A', 'A-CBFE');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('30000000-0000-0000-0000-000000000004', 'IT-Y4-B', 7, 4, 1, 60, 2, 'IT-Y4-B', 'B-56D3');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('30000000-0000-0000-0000-000000000004', 'IT-Y4-C', 7, 4, 1, 60, 2, 'IT-Y4-C', 'C-A746');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('30000000-0000-0000-0000-000000000004', 'IT-Y4-D', 7, 4, 1, 60, 2, 'IT-Y4-D', 'D-C7B3');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('40000000-0000-0000-0000-000000000001', 'TCS-Y1-A', 1, 1, 1, 60, 2, 'TCS-Y1-A', 'T-871A');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('40000000-0000-0000-0000-000000000001', 'IBM-Y1-A', 1, 1, 1, 60, 2, 'IBM-Y1-A', 'I-4D0E');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('40000000-0000-0000-0000-000000000001', 'IBM-Y1-B', 1, 1, 1, 60, 2, 'IBM-Y1-B', 'I-AB04');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('40000000-0000-0000-0000-000000000001', 'APPLE-Y1-A', 1, 1, 1, 60, 2, 'APPLE-Y1-A', 'A-E79A');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('40000000-0000-0000-0000-000000000002', 'TCS-Y2-A', 3, 2, 2, 60, 2, 'TCS-Y2-A', 'T-461E');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('40000000-0000-0000-0000-000000000002', 'IBM-Y2-A', 3, 2, 2, 60, 2, 'IBM-Y2-A', 'I-10D1');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('40000000-0000-0000-0000-000000000002', 'IBM-Y2-B', 3, 2, 2, 60, 2, 'IBM-Y2-B', 'I-777A');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('40000000-0000-0000-0000-000000000002', 'APPLE-Y2-A', 3, 2, 2, 60, 2, 'APPLE-Y2-A', 'A-F947');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('40000000-0000-0000-0000-000000000003', 'TCS-Y3-A', 5, 3, 2, 60, 2, 'TCS-Y3-A', 'T-17F7');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('40000000-0000-0000-0000-000000000003', 'IBM-Y3-A', 5, 3, 2, 60, 2, 'IBM-Y3-A', 'I-FE80');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('40000000-0000-0000-0000-000000000003', 'IBM-Y3-B', 5, 3, 2, 60, 2, 'IBM-Y3-B', 'I-560F');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('40000000-0000-0000-0000-000000000003', 'APPLE-Y3-A', 5, 3, 2, 60, 2, 'APPLE-Y3-A', 'A-6F5C');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('40000000-0000-0000-0000-000000000004', 'TCS-Y4-A', 7, 4, 1, 60, 2, 'TCS-Y4-A', 'T-1B5B');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('40000000-0000-0000-0000-000000000004', 'IBM-Y4-A', 7, 4, 1, 60, 2, 'IBM-Y4-A', 'I-5B82');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('40000000-0000-0000-0000-000000000004', 'IBM-Y4-B', 7, 4, 1, 60, 2, 'IBM-Y4-B', 'I-689B');
  insert into sections (program_id, name, semester, academic_year, shift, strength, batch_count, code, passkey)
  values ('40000000-0000-0000-0000-000000000004', 'APPLE-Y4-A', 7, 4, 1, 60, 2, 'APPLE-Y4-A', 'A-B7D2');

  -- -------------------------------------------------------------------------
  -- 7. Courses (Real University Degree Curriculum)
  -- -------------------------------------------------------------------------
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'BTCS101M', 'INTRODUCTION TO COMPUTER SCIENCE AND ENGINEERING', 4, 4, 0, 0, 4, false, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'BTCS101M(P)', 'INTRODUCTION TO COmPUTER SCIENCE AND ENGINEERING LAB', 2, 0, 0, 2, 1, true, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'BTCS103M', 'COMPUTER SYSTEM ORGANIZATION', 4, 4, 0, 0, 4, false, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'BTCS103M(P)', 'COMPUTER SYSTEM ORGANIZATION', 2, 0, 0, 2, 1, true, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'BTCS107M(P)', 'PROGRAM DEVELOPMENT USING C', 2, 0, 0, 2, 1, true, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'BTMA101N', 'MATHEMATICS - I', 4, 4, 0, 0, 4, false, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'BTPH101', 'APPLIED PHYSICS', 4, 4, 0, 0, 4, false, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'BTPH101(P)', 'APPLIED PHYSICS', 2, 0, 0, 2, 1, true, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'HUCS101', 'COMMUNICATION SKILLS', 2, 2, 0, 0, 2, false, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'HUCS101(P)', 'COMMUNICATION SKILLS', 2, 0, 0, 2, 1, true, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'BTCS102M', 'INTRODUCTION TO DESIGN THINKING', 3, 3, 0, 0, 3, false, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'BTCS102M(P)', 'INTRODUCTION TO DESIGN THINKING', 2, 0, 0, 2, 1, true, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'BTCS202M', 'OBJECT ORIENTED PROGRAMMING WITH C++', 3, 3, 0, 0, 3, false, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'BTCS202M(P)', 'OBJECT ORIENTED PROGRAMMING WITH C++', 2, 0, 0, 2, 1, true, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'BTEC104', 'DIGITAL LOGIC AND CIRCUIT DESIGN', 4, 4, 0, 0, 4, false, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'BTEC104(P)', 'DIGITAL LOGIC AND CIRCUIT DESIGN', 2, 0, 0, 2, 1, true, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_it, 'BTIT201M', 'DATA COMMUNICATION', 3, 3, 0, 0, 3, false, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_it, 'BTIT208M(P)', 'UNIX PROGRAMMING', 2, 0, 0, 2, 1, true, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'BTMA201N', 'MATHEMATICS - II', 4, 4, 0, 0, 4, false, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'BTCS301N', 'DISCRETE STRUCTURES', 3, 3, 0, 0, 3, false, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'BTCS306M', 'FUNDAMENTALS OF DATA STRUCTURES', 3, 3, 0, 0, 3, false, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'BTCS306M(P)', 'FUNDAMENTALS OF DATA STRUCTURES', 2, 0, 0, 2, 1, true, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'BTCS307M', 'PRICIPLES OF OPERATING SYSTEMS', 3, 3, 0, 0, 3, false, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'BTCS307M(P)', 'PRICIPLES OF OPERATING SYSTEMS', 2, 0, 0, 2, 1, true, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'BTCS402N', 'SOFTWARE ENGINEERING AND PROJECT MANAGEMENT', 3, 3, 0, 0, 3, false, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'BTCS402N(P)', 'SOFTWARE ENGINEERING AND PROJECT MANAGEMENT', 2, 0, 0, 2, 1, true, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_aids, 'BTDSE322M', 'PRINCIPLES OF PROGRAMMING LANGUAGE', 2, 2, 0, 0, 2, false, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_aids, 'BTDSE322M(P)', 'PRINCIPLES OF PROGRAMMING LANGUAGE', 2, 0, 0, 2, 1, true, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_it, 'BTIT307N(P)', 'INTRODUCTION TO CORE JAVA', 2, 0, 0, 2, 1, true, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'GU-SEM3', 'GENERIC ELECTIVE (SEM 3)', 4, 4, 0, 0, 4, false, true);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'BTCS302N', 'ANALYSIS AND DESIGN OF ALGORITHMS', 4, 4, 0, 0, 4, false, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'BTCS302N(P)', 'ANALYSIS AND DESIGN OF ALGORITHMS', 2, 0, 0, 2, 1, true, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'BTCS401N', 'DATABASE MANAGEMENT SYSTEMS', 4, 4, 0, 0, 4, false, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'BTCS401N(P)', 'DATABASE MANAGEMENT SYSTEMS', 2, 0, 0, 2, 1, true, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_aids, 'BTDSE423M', 'INFORMATION STORAGE AND MANAGEMENT', 2, 2, 0, 0, 2, false, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_aids, 'BTDSE423M(P)', 'INFORMATION STORAGE AND MANAGEMENT', 2, 0, 0, 2, 1, true, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_it, 'BTIT301N', 'COMPUTER NETWORKS', 3, 3, 0, 0, 3, false, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_it, 'BTIT301N(P)', 'COMPUTER NETWORKS', 2, 0, 0, 2, 1, true, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_it, 'BTIT410M(P)', 'ADVANCED CONCEPTS IN JAVA', 2, 0, 0, 2, 1, true, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'ML307', 'ENVIRONMENTAL MANAGEMENT AND SUSTAINABILITY', 3, 3, 0, 0, 3, false, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'BTCS501N', 'THEORY OF COMPUTATION', 4, 4, 0, 0, 4, false, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'BTCS502N', 'INTRODUCTION TO ARTIFICIAL INTELLIGENCE', 3, 3, 0, 0, 3, false, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'BTCS502N(P)', 'INTRODUCTION TO ARTIFICIAL INTELLIGENCE', 2, 0, 0, 2, 1, true, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'BTCS503M', 'NETWORK SECURITY AND CRYPTOGRAPHY', 3, 3, 0, 0, 3, false, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'BTCS503M(P)', 'NETWORK SECURITY AND CRYPTOGRAPHY', 2, 0, 0, 2, 1, true, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_aids, 'BTDSE511M', 'IMAGE PROCESSING', 3, 3, 0, 0, 3, false, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_aids, 'BTDSE511M(P)', 'IMAGE PROCESSING', 2, 0, 0, 2, 1, true, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_it, 'BTIT507M(P)', 'PROGRAMMING WITH PYTHON', 2, 0, 0, 2, 1, true, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_it, 'BTIT508M(p)', 'NO SQL AND MONGODB', 2, 0, 0, 2, 1, true, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'GU-SEM5', 'GENERIC ELECTIVE (SEM 5)', 4, 4, 0, 0, 4, false, true);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'BTCS601N', 'COMPILER DESIGN', 3, 3, 0, 0, 3, false, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'BTCS601N(P)', 'COMPILER DESIGN', 2, 0, 0, 2, 1, true, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'BTCS602N', 'OBJECT ORIENTED ANALYSIS AND DESIGN', 3, 3, 0, 0, 3, false, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'BTCS602N(P)', 'OBJECT ORIENTED ANALYSIS AND DESIGN', 2, 0, 0, 2, 1, true, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'BTCS603N', 'INTRODUCTION TO CLOUD COMPUTING', 3, 3, 0, 0, 3, false, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'BTCS603N(P)', 'INTRODUCTION TO CLOUD COMPUTING', 2, 0, 0, 2, 1, true, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'BTCS607N', 'MINOR PROJECT', 2, 2, 0, 0, 2, false, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'BTCS708N', 'INTRODUCTION TO DATA SCIENCE', 3, 3, 0, 0, 3, false, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'BTCS708N(P)', 'INTRODUCTION TO DATA SCIENCE', 2, 0, 0, 2, 1, true, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_aids, 'BTDSE613M', 'INTERNET OF THINGS', 3, 3, 0, 0, 3, false, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'BBAI501', 'HUMAN VALUES AND PROFESSIONAL ETHICS', 3, 3, 0, 0, 3, false, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'BTCS706N', 'MAJOR PROJECT', 1, 1, 0, 0, 1, false, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'BTCS710', 'DEEP LEARNING FOUNDATIONS', 4, 4, 0, 0, 4, false, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'BTCS710(P)', 'DEEP LEARNING FOUNDATIONS', 2, 0, 0, 2, 1, true, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'BTCS711', 'INTRODUCTION TO QUANTUM COMPUTING', 3, 3, 0, 0, 3, false, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'BTCS711(P)', 'INTRODUCTION TO QUANTUM COMPUTING', 2, 0, 0, 2, 1, true, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'BTCS712(P)', 'CLOUD COMPETENCY LAB', 2, 0, 0, 2, 1, true, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_aids, 'BTDSE722', 'PROMPT ENGINEERING AND FINE-TUNING', 3, 3, 0, 0, 3, false, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_aids, 'BTDSE722(P)', 'PROMPT ENGINEERING AND FINE-TUNING', 2, 0, 0, 2, 1, true, false);
  insert into courses (department_id, code, name, credits, lectures_per_week, tutorials_per_week, practicals_per_week, sessions_per_week, lab_required, is_elective)
  values (v_dept_cse, 'GU-SEM7', 'GENERIC ELECTIVE (SEM 7)', 4, 4, 0, 0, 4, false, true);

  -- -------------------------------------------------------------------------
  -- 8. Faculty (121 Instructors, Max Load 24 hr/week)
  -- -------------------------------------------------------------------------
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Aarav Sharma', 'aarav.sharma1@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Aditi Sharma', 'aditi.sharma2@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Dr. Amit Sharma', 'amit.sharma3@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Ananya Sharma', 'ananya.sharma4@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Arjun Sharma', 'arjun.sharma5@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Dr. Bhavna Sharma', 'bhavna.sharma6@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Chetan Sharma', 'chetan.sharma7@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Dev Sharma', 'dev.sharma8@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Dr. Divya Sharma', 'divya.sharma9@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Eshan Sharma', 'eshan.sharma10@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Fatima Sharma', 'fatima.sharma11@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Dr. Gaurav Sharma', 'gaurav.sharma12@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Harshit Sharma', 'harshit.sharma13@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Ishita Sharma', 'ishita.sharma14@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Dr. Jatin Sharma', 'jatin.sharma15@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Kavita Sharma', 'kavita.sharma16@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Lalit Sharma', 'lalit.sharma17@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Dr. Meenakshi Sharma', 'meenakshi.sharma18@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Nitin Sharma', 'nitin.sharma19@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Omkar Sharma', 'omkar.sharma20@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Dr. Pooja Sharma', 'pooja.sharma21@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Pranav Sharma', 'pranav.sharma22@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Priya Sharma', 'priya.sharma23@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Dr. Rahul Sharma', 'rahul.sharma24@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Rakesh Sharma', 'rakesh.sharma25@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Riya Sharma', 'riya.sharma26@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Dr. Rohan Sharma', 'rohan.sharma27@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Sakshi Sharma', 'sakshi.sharma28@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Sameer Sharma', 'sameer.sharma29@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Dr. Sanjay Sharma', 'sanjay.sharma30@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Shreya Sharma', 'shreya.sharma31@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Siddharth Sharma', 'siddharth.sharma32@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Dr. Sneha Sharma', 'sneha.sharma33@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Tanvi Sharma', 'tanvi.sharma34@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Utkarsh Sharma', 'utkarsh.sharma35@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Dr. Varun Sharma', 'varun.sharma36@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Vikram Sharma', 'vikram.sharma37@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Yash Sharma', 'yash.sharma38@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Dr. Zoya Sharma', 'zoya.sharma39@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Alok Sharma', 'alok.sharma40@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Ashish Sharma', 'ashish.sharma41@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Dr. Deepak Sharma', 'deepak.sharma42@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Karan Sharma', 'karan.sharma43@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Manish Sharma', 'manish.sharma44@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Dr. Mayank Sharma', 'mayank.sharma45@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Naveen Sharma', 'naveen.sharma46@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Nikhil Sharma', 'nikhil.sharma47@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Dr. Pankaj Sharma', 'pankaj.sharma48@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Rajesh Sharma', 'rajesh.sharma49@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Sachin Sharma', 'sachin.sharma50@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Dr. Aarav Verma', 'aarav.verma51@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Aditi Verma', 'aditi.verma52@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Amit Verma', 'amit.verma53@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Dr. Ananya Verma', 'ananya.verma54@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Arjun Verma', 'arjun.verma55@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Bhavna Verma', 'bhavna.verma56@institute.edu', v_dept_cse, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Dr. Chetan Verma', 'chetan.verma57@institute.edu', v_dept_aids, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Dev Verma', 'dev.verma58@institute.edu', v_dept_aids, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Divya Verma', 'divya.verma59@institute.edu', v_dept_aids, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Dr. Eshan Verma', 'eshan.verma60@institute.edu', v_dept_aids, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Fatima Verma', 'fatima.verma61@institute.edu', v_dept_aids, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Gaurav Verma', 'gaurav.verma62@institute.edu', v_dept_aids, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Dr. Harshit Verma', 'harshit.verma63@institute.edu', v_dept_aids, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Ishita Verma', 'ishita.verma64@institute.edu', v_dept_aids, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Jatin Verma', 'jatin.verma65@institute.edu', v_dept_aids, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Dr. Kavita Verma', 'kavita.verma66@institute.edu', v_dept_aids, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Lalit Verma', 'lalit.verma67@institute.edu', v_dept_aids, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Meenakshi Verma', 'meenakshi.verma68@institute.edu', v_dept_aids, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Dr. Nitin Verma', 'nitin.verma69@institute.edu', v_dept_aids, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Omkar Verma', 'omkar.verma70@institute.edu', v_dept_aids, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Pooja Verma', 'pooja.verma71@institute.edu', v_dept_it, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Dr. Pranav Verma', 'pranav.verma72@institute.edu', v_dept_it, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Priya Verma', 'priya.verma73@institute.edu', v_dept_it, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Rahul Verma', 'rahul.verma74@institute.edu', v_dept_it, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Dr. Rakesh Verma', 'rakesh.verma75@institute.edu', v_dept_it, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Riya Verma', 'riya.verma76@institute.edu', v_dept_it, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Rohan Verma', 'rohan.verma77@institute.edu', v_dept_it, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Dr. Sakshi Verma', 'sakshi.verma78@institute.edu', v_dept_it, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Sameer Verma', 'sameer.verma79@institute.edu', v_dept_it, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Sanjay Verma', 'sanjay.verma80@institute.edu', v_dept_it, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Dr. Shreya Verma', 'shreya.verma81@institute.edu', v_dept_it, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Siddharth Verma', 'siddharth.verma82@institute.edu', v_dept_it, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Sneha Verma', 'sneha.verma83@institute.edu', v_dept_it, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Dr. Tanvi Verma', 'tanvi.verma84@institute.edu', v_dept_it, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Utkarsh Verma', 'utkarsh.verma85@institute.edu', v_dept_it, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Varun Verma', 'varun.verma86@institute.edu', v_dept_it, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Dr. Vikram Verma', 'vikram.verma87@institute.edu', v_dept_it, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Yash Verma', 'yash.verma88@institute.edu', v_dept_it, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Zoya Verma', 'zoya.verma89@institute.edu', v_dept_it, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Dr. Alok Verma', 'alok.verma90@institute.edu', v_dept_it, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Ashish Verma', 'ashish.verma91@institute.edu', v_dept_it, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Deepak Verma', 'deepak.verma92@institute.edu', v_dept_it, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Dr. Karan Verma', 'karan.verma93@institute.edu', v_dept_it, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Manish Verma', 'manish.verma94@institute.edu', v_dept_it, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Mayank Verma', 'mayank.verma95@institute.edu', v_dept_it, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Dr. Naveen Verma', 'naveen.verma96@institute.edu', v_dept_ind, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Nikhil Verma', 'nikhil.verma97@institute.edu', v_dept_ind, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Pankaj Verma', 'pankaj.verma98@institute.edu', v_dept_ind, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Dr. Rajesh Verma', 'rajesh.verma99@institute.edu', v_dept_ind, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Sachin Verma', 'sachin.verma100@institute.edu', v_dept_ind, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Aarav Gupta', 'aarav.gupta101@institute.edu', v_dept_ind, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Dr. Aditi Gupta', 'aditi.gupta102@institute.edu', v_dept_ind, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Amit Gupta', 'amit.gupta103@institute.edu', v_dept_ind, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Ananya Gupta', 'ananya.gupta104@institute.edu', v_dept_ind, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Dr. Arjun Gupta', 'arjun.gupta105@institute.edu', v_dept_ind, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Bhavna Gupta', 'bhavna.gupta106@institute.edu', v_dept_ind, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Chetan Gupta', 'chetan.gupta107@institute.edu', v_dept_ind, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Dr. Dev Gupta', 'dev.gupta108@institute.edu', v_dept_ind, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Divya Gupta', 'divya.gupta109@institute.edu', v_dept_ind, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Eshan Gupta', 'eshan.gupta110@institute.edu', v_dept_ind, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Dr. Fatima Gupta', 'fatima.gupta111@institute.edu', v_dept_ind, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Gaurav Gupta', 'gaurav.gupta112@institute.edu', v_dept_ind, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Harshit Gupta', 'harshit.gupta113@institute.edu', v_dept_ind, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Dr. Ishita Gupta', 'ishita.gupta114@institute.edu', v_dept_ind, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Jatin Gupta', 'jatin.gupta115@institute.edu', v_dept_ind, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Kavita Gupta', 'kavita.gupta116@institute.edu', v_dept_ind, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Dr. Lalit Gupta', 'lalit.gupta117@institute.edu', v_dept_ind, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Meenakshi Gupta', 'meenakshi.gupta118@institute.edu', v_dept_ind, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Prof. Nitin Gupta', 'nitin.gupta119@institute.edu', v_dept_ind, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Dr. Omkar Gupta', 'omkar.gupta120@institute.edu', v_dept_ind, 24);
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
  values (v_inst, 'Cross-Department / Elective Faculty', 'elective.faculty@institute.edu', v_dept_cse, 999);

  -- -------------------------------------------------------------------------
  -- -------------------------------------------------------------------------
  -- 9. Qualifications: Universal (Any faculty can teach any course - no table inserts needed)
  -- -------------------------------------------------------------------------

  -- -------------------------------------------------------------------------
  -- 10. Section-Course Curriculum Mapping (525 Mappings)
  -- -------------------------------------------------------------------------
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-A' limit 1), (select id from courses where code = 'BTCS101M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-A' limit 1), (select id from courses where code = 'BTCS101M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-A' limit 1), (select id from courses where code = 'BTCS103M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-A' limit 1), (select id from courses where code = 'BTCS103M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-A' limit 1), (select id from courses where code = 'BTCS107M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-A' limit 1), (select id from courses where code = 'BTMA101N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-A' limit 1), (select id from courses where code = 'BTPH101' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-A' limit 1), (select id from courses where code = 'BTPH101(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-A' limit 1), (select id from courses where code = 'HUCS101' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-A' limit 1), (select id from courses where code = 'HUCS101(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-B' limit 1), (select id from courses where code = 'BTCS101M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-B' limit 1), (select id from courses where code = 'BTCS101M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-B' limit 1), (select id from courses where code = 'BTCS103M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-B' limit 1), (select id from courses where code = 'BTCS103M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-B' limit 1), (select id from courses where code = 'BTCS107M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-B' limit 1), (select id from courses where code = 'BTMA101N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-B' limit 1), (select id from courses where code = 'BTPH101' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-B' limit 1), (select id from courses where code = 'BTPH101(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-B' limit 1), (select id from courses where code = 'HUCS101' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-B' limit 1), (select id from courses where code = 'HUCS101(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-C' limit 1), (select id from courses where code = 'BTCS101M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-C' limit 1), (select id from courses where code = 'BTCS101M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-C' limit 1), (select id from courses where code = 'BTCS103M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-C' limit 1), (select id from courses where code = 'BTCS103M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-C' limit 1), (select id from courses where code = 'BTCS107M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-C' limit 1), (select id from courses where code = 'BTMA101N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-C' limit 1), (select id from courses where code = 'BTPH101' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-C' limit 1), (select id from courses where code = 'BTPH101(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-C' limit 1), (select id from courses where code = 'HUCS101' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-C' limit 1), (select id from courses where code = 'HUCS101(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-D' limit 1), (select id from courses where code = 'BTCS101M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-D' limit 1), (select id from courses where code = 'BTCS101M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-D' limit 1), (select id from courses where code = 'BTCS103M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-D' limit 1), (select id from courses where code = 'BTCS103M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-D' limit 1), (select id from courses where code = 'BTCS107M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-D' limit 1), (select id from courses where code = 'BTMA101N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-D' limit 1), (select id from courses where code = 'BTPH101' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-D' limit 1), (select id from courses where code = 'BTPH101(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-D' limit 1), (select id from courses where code = 'HUCS101' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-D' limit 1), (select id from courses where code = 'HUCS101(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-E' limit 1), (select id from courses where code = 'BTCS101M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-E' limit 1), (select id from courses where code = 'BTCS101M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-E' limit 1), (select id from courses where code = 'BTCS103M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-E' limit 1), (select id from courses where code = 'BTCS103M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-E' limit 1), (select id from courses where code = 'BTCS107M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-E' limit 1), (select id from courses where code = 'BTMA101N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-E' limit 1), (select id from courses where code = 'BTPH101' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-E' limit 1), (select id from courses where code = 'BTPH101(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-E' limit 1), (select id from courses where code = 'HUCS101' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-E' limit 1), (select id from courses where code = 'HUCS101(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-F' limit 1), (select id from courses where code = 'BTCS101M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-F' limit 1), (select id from courses where code = 'BTCS101M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-F' limit 1), (select id from courses where code = 'BTCS103M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-F' limit 1), (select id from courses where code = 'BTCS103M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-F' limit 1), (select id from courses where code = 'BTCS107M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-F' limit 1), (select id from courses where code = 'BTMA101N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-F' limit 1), (select id from courses where code = 'BTPH101' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-F' limit 1), (select id from courses where code = 'BTPH101(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-F' limit 1), (select id from courses where code = 'HUCS101' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-F' limit 1), (select id from courses where code = 'HUCS101(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-G' limit 1), (select id from courses where code = 'BTCS101M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-G' limit 1), (select id from courses where code = 'BTCS101M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-G' limit 1), (select id from courses where code = 'BTCS103M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-G' limit 1), (select id from courses where code = 'BTCS103M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-G' limit 1), (select id from courses where code = 'BTCS107M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-G' limit 1), (select id from courses where code = 'BTMA101N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-G' limit 1), (select id from courses where code = 'BTPH101' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-G' limit 1), (select id from courses where code = 'BTPH101(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-G' limit 1), (select id from courses where code = 'HUCS101' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-G' limit 1), (select id from courses where code = 'HUCS101(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-H' limit 1), (select id from courses where code = 'BTCS101M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-H' limit 1), (select id from courses where code = 'BTCS101M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-H' limit 1), (select id from courses where code = 'BTCS103M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-H' limit 1), (select id from courses where code = 'BTCS103M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-H' limit 1), (select id from courses where code = 'BTCS107M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-H' limit 1), (select id from courses where code = 'BTMA101N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-H' limit 1), (select id from courses where code = 'BTPH101' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-H' limit 1), (select id from courses where code = 'BTPH101(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-H' limit 1), (select id from courses where code = 'HUCS101' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y1-H' limit 1), (select id from courses where code = 'HUCS101(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-A' limit 1), (select id from courses where code = 'BTCS301N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-A' limit 1), (select id from courses where code = 'BTCS306M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-A' limit 1), (select id from courses where code = 'BTCS306M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-A' limit 1), (select id from courses where code = 'BTCS307M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-A' limit 1), (select id from courses where code = 'BTCS307M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-A' limit 1), (select id from courses where code = 'BTCS402N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-A' limit 1), (select id from courses where code = 'BTCS402N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-A' limit 1), (select id from courses where code = 'BTDSE322M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-A' limit 1), (select id from courses where code = 'BTDSE322M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-A' limit 1), (select id from courses where code = 'BTIT307N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-A' limit 1), (select id from courses where code = 'GU-SEM3' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-B' limit 1), (select id from courses where code = 'BTCS301N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-B' limit 1), (select id from courses where code = 'BTCS306M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-B' limit 1), (select id from courses where code = 'BTCS306M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-B' limit 1), (select id from courses where code = 'BTCS307M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-B' limit 1), (select id from courses where code = 'BTCS307M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-B' limit 1), (select id from courses where code = 'BTCS402N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-B' limit 1), (select id from courses where code = 'BTCS402N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-B' limit 1), (select id from courses where code = 'BTDSE322M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-B' limit 1), (select id from courses where code = 'BTDSE322M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-B' limit 1), (select id from courses where code = 'BTIT307N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-B' limit 1), (select id from courses where code = 'GU-SEM3' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-C' limit 1), (select id from courses where code = 'BTCS301N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-C' limit 1), (select id from courses where code = 'BTCS306M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-C' limit 1), (select id from courses where code = 'BTCS306M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-C' limit 1), (select id from courses where code = 'BTCS307M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-C' limit 1), (select id from courses where code = 'BTCS307M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-C' limit 1), (select id from courses where code = 'BTCS402N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-C' limit 1), (select id from courses where code = 'BTCS402N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-C' limit 1), (select id from courses where code = 'BTDSE322M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-C' limit 1), (select id from courses where code = 'BTDSE322M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-C' limit 1), (select id from courses where code = 'BTIT307N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-C' limit 1), (select id from courses where code = 'GU-SEM3' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-D' limit 1), (select id from courses where code = 'BTCS301N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-D' limit 1), (select id from courses where code = 'BTCS306M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-D' limit 1), (select id from courses where code = 'BTCS306M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-D' limit 1), (select id from courses where code = 'BTCS307M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-D' limit 1), (select id from courses where code = 'BTCS307M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-D' limit 1), (select id from courses where code = 'BTCS402N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-D' limit 1), (select id from courses where code = 'BTCS402N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-D' limit 1), (select id from courses where code = 'BTDSE322M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-D' limit 1), (select id from courses where code = 'BTDSE322M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-D' limit 1), (select id from courses where code = 'BTIT307N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-D' limit 1), (select id from courses where code = 'GU-SEM3' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-E' limit 1), (select id from courses where code = 'BTCS301N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-E' limit 1), (select id from courses where code = 'BTCS306M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-E' limit 1), (select id from courses where code = 'BTCS306M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-E' limit 1), (select id from courses where code = 'BTCS307M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-E' limit 1), (select id from courses where code = 'BTCS307M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-E' limit 1), (select id from courses where code = 'BTCS402N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-E' limit 1), (select id from courses where code = 'BTCS402N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-E' limit 1), (select id from courses where code = 'BTDSE322M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-E' limit 1), (select id from courses where code = 'BTDSE322M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-E' limit 1), (select id from courses where code = 'BTIT307N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-E' limit 1), (select id from courses where code = 'GU-SEM3' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-F' limit 1), (select id from courses where code = 'BTCS301N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-F' limit 1), (select id from courses where code = 'BTCS306M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-F' limit 1), (select id from courses where code = 'BTCS306M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-F' limit 1), (select id from courses where code = 'BTCS307M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-F' limit 1), (select id from courses where code = 'BTCS307M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-F' limit 1), (select id from courses where code = 'BTCS402N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-F' limit 1), (select id from courses where code = 'BTCS402N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-F' limit 1), (select id from courses where code = 'BTDSE322M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-F' limit 1), (select id from courses where code = 'BTDSE322M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-F' limit 1), (select id from courses where code = 'BTIT307N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-F' limit 1), (select id from courses where code = 'GU-SEM3' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-G' limit 1), (select id from courses where code = 'BTCS301N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-G' limit 1), (select id from courses where code = 'BTCS306M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-G' limit 1), (select id from courses where code = 'BTCS306M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-G' limit 1), (select id from courses where code = 'BTCS307M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-G' limit 1), (select id from courses where code = 'BTCS307M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-G' limit 1), (select id from courses where code = 'BTCS402N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-G' limit 1), (select id from courses where code = 'BTCS402N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-G' limit 1), (select id from courses where code = 'BTDSE322M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-G' limit 1), (select id from courses where code = 'BTDSE322M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-G' limit 1), (select id from courses where code = 'BTIT307N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-G' limit 1), (select id from courses where code = 'GU-SEM3' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-H' limit 1), (select id from courses where code = 'BTCS301N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-H' limit 1), (select id from courses where code = 'BTCS306M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-H' limit 1), (select id from courses where code = 'BTCS306M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-H' limit 1), (select id from courses where code = 'BTCS307M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-H' limit 1), (select id from courses where code = 'BTCS307M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-H' limit 1), (select id from courses where code = 'BTCS402N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-H' limit 1), (select id from courses where code = 'BTCS402N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-H' limit 1), (select id from courses where code = 'BTDSE322M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-H' limit 1), (select id from courses where code = 'BTDSE322M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-H' limit 1), (select id from courses where code = 'BTIT307N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y2-H' limit 1), (select id from courses where code = 'GU-SEM3' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-A' limit 1), (select id from courses where code = 'BTCS501N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-A' limit 1), (select id from courses where code = 'BTCS502N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-A' limit 1), (select id from courses where code = 'BTCS502N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-A' limit 1), (select id from courses where code = 'BTCS503M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-A' limit 1), (select id from courses where code = 'BTCS503M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-A' limit 1), (select id from courses where code = 'BTDSE511M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-A' limit 1), (select id from courses where code = 'BTDSE511M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-A' limit 1), (select id from courses where code = 'BTIT507M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-A' limit 1), (select id from courses where code = 'BTIT508M(p)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-A' limit 1), (select id from courses where code = 'GU-SEM5' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-B' limit 1), (select id from courses where code = 'BTCS501N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-B' limit 1), (select id from courses where code = 'BTCS502N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-B' limit 1), (select id from courses where code = 'BTCS502N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-B' limit 1), (select id from courses where code = 'BTCS503M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-B' limit 1), (select id from courses where code = 'BTCS503M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-B' limit 1), (select id from courses where code = 'BTDSE511M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-B' limit 1), (select id from courses where code = 'BTDSE511M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-B' limit 1), (select id from courses where code = 'BTIT507M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-B' limit 1), (select id from courses where code = 'BTIT508M(p)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-B' limit 1), (select id from courses where code = 'GU-SEM5' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-C' limit 1), (select id from courses where code = 'BTCS501N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-C' limit 1), (select id from courses where code = 'BTCS502N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-C' limit 1), (select id from courses where code = 'BTCS502N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-C' limit 1), (select id from courses where code = 'BTCS503M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-C' limit 1), (select id from courses where code = 'BTCS503M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-C' limit 1), (select id from courses where code = 'BTDSE511M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-C' limit 1), (select id from courses where code = 'BTDSE511M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-C' limit 1), (select id from courses where code = 'BTIT507M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-C' limit 1), (select id from courses where code = 'BTIT508M(p)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-C' limit 1), (select id from courses where code = 'GU-SEM5' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-D' limit 1), (select id from courses where code = 'BTCS501N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-D' limit 1), (select id from courses where code = 'BTCS502N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-D' limit 1), (select id from courses where code = 'BTCS502N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-D' limit 1), (select id from courses where code = 'BTCS503M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-D' limit 1), (select id from courses where code = 'BTCS503M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-D' limit 1), (select id from courses where code = 'BTDSE511M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-D' limit 1), (select id from courses where code = 'BTDSE511M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-D' limit 1), (select id from courses where code = 'BTIT507M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-D' limit 1), (select id from courses where code = 'BTIT508M(p)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-D' limit 1), (select id from courses where code = 'GU-SEM5' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-E' limit 1), (select id from courses where code = 'BTCS501N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-E' limit 1), (select id from courses where code = 'BTCS502N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-E' limit 1), (select id from courses where code = 'BTCS502N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-E' limit 1), (select id from courses where code = 'BTCS503M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-E' limit 1), (select id from courses where code = 'BTCS503M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-E' limit 1), (select id from courses where code = 'BTDSE511M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-E' limit 1), (select id from courses where code = 'BTDSE511M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-E' limit 1), (select id from courses where code = 'BTIT507M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-E' limit 1), (select id from courses where code = 'BTIT508M(p)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-E' limit 1), (select id from courses where code = 'GU-SEM5' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-F' limit 1), (select id from courses where code = 'BTCS501N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-F' limit 1), (select id from courses where code = 'BTCS502N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-F' limit 1), (select id from courses where code = 'BTCS502N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-F' limit 1), (select id from courses where code = 'BTCS503M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-F' limit 1), (select id from courses where code = 'BTCS503M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-F' limit 1), (select id from courses where code = 'BTDSE511M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-F' limit 1), (select id from courses where code = 'BTDSE511M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-F' limit 1), (select id from courses where code = 'BTIT507M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-F' limit 1), (select id from courses where code = 'BTIT508M(p)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-F' limit 1), (select id from courses where code = 'GU-SEM5' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-G' limit 1), (select id from courses where code = 'BTCS501N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-G' limit 1), (select id from courses where code = 'BTCS502N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-G' limit 1), (select id from courses where code = 'BTCS502N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-G' limit 1), (select id from courses where code = 'BTCS503M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-G' limit 1), (select id from courses where code = 'BTCS503M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-G' limit 1), (select id from courses where code = 'BTDSE511M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-G' limit 1), (select id from courses where code = 'BTDSE511M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-G' limit 1), (select id from courses where code = 'BTIT507M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-G' limit 1), (select id from courses where code = 'BTIT508M(p)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-G' limit 1), (select id from courses where code = 'GU-SEM5' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-H' limit 1), (select id from courses where code = 'BTCS501N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-H' limit 1), (select id from courses where code = 'BTCS502N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-H' limit 1), (select id from courses where code = 'BTCS502N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-H' limit 1), (select id from courses where code = 'BTCS503M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-H' limit 1), (select id from courses where code = 'BTCS503M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-H' limit 1), (select id from courses where code = 'BTDSE511M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-H' limit 1), (select id from courses where code = 'BTDSE511M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-H' limit 1), (select id from courses where code = 'BTIT507M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-H' limit 1), (select id from courses where code = 'BTIT508M(p)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-H' limit 1), (select id from courses where code = 'GU-SEM5' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-I' limit 1), (select id from courses where code = 'BTCS501N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-I' limit 1), (select id from courses where code = 'BTCS502N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-I' limit 1), (select id from courses where code = 'BTCS502N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-I' limit 1), (select id from courses where code = 'BTCS503M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-I' limit 1), (select id from courses where code = 'BTCS503M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-I' limit 1), (select id from courses where code = 'BTDSE511M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-I' limit 1), (select id from courses where code = 'BTDSE511M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-I' limit 1), (select id from courses where code = 'BTIT507M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-I' limit 1), (select id from courses where code = 'BTIT508M(p)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y3-I' limit 1), (select id from courses where code = 'GU-SEM5' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-A' limit 1), (select id from courses where code = 'BBAI501' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-A' limit 1), (select id from courses where code = 'BTCS706N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-A' limit 1), (select id from courses where code = 'BTCS710' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-A' limit 1), (select id from courses where code = 'BTCS710(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-A' limit 1), (select id from courses where code = 'BTCS711' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-A' limit 1), (select id from courses where code = 'BTCS711(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-A' limit 1), (select id from courses where code = 'BTCS712(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-A' limit 1), (select id from courses where code = 'BTDSE722' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-A' limit 1), (select id from courses where code = 'BTDSE722(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-A' limit 1), (select id from courses where code = 'GU-SEM7' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-B' limit 1), (select id from courses where code = 'BBAI501' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-B' limit 1), (select id from courses where code = 'BTCS706N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-B' limit 1), (select id from courses where code = 'BTCS710' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-B' limit 1), (select id from courses where code = 'BTCS710(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-B' limit 1), (select id from courses where code = 'BTCS711' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-B' limit 1), (select id from courses where code = 'BTCS711(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-B' limit 1), (select id from courses where code = 'BTCS712(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-B' limit 1), (select id from courses where code = 'BTDSE722' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-B' limit 1), (select id from courses where code = 'BTDSE722(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-B' limit 1), (select id from courses where code = 'GU-SEM7' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-C' limit 1), (select id from courses where code = 'BBAI501' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-C' limit 1), (select id from courses where code = 'BTCS706N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-C' limit 1), (select id from courses where code = 'BTCS710' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-C' limit 1), (select id from courses where code = 'BTCS710(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-C' limit 1), (select id from courses where code = 'BTCS711' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-C' limit 1), (select id from courses where code = 'BTCS711(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-C' limit 1), (select id from courses where code = 'BTCS712(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-C' limit 1), (select id from courses where code = 'BTDSE722' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-C' limit 1), (select id from courses where code = 'BTDSE722(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-C' limit 1), (select id from courses where code = 'GU-SEM7' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-D' limit 1), (select id from courses where code = 'BBAI501' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-D' limit 1), (select id from courses where code = 'BTCS706N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-D' limit 1), (select id from courses where code = 'BTCS710' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-D' limit 1), (select id from courses where code = 'BTCS710(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-D' limit 1), (select id from courses where code = 'BTCS711' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-D' limit 1), (select id from courses where code = 'BTCS711(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-D' limit 1), (select id from courses where code = 'BTCS712(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-D' limit 1), (select id from courses where code = 'BTDSE722' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-D' limit 1), (select id from courses where code = 'BTDSE722(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-D' limit 1), (select id from courses where code = 'GU-SEM7' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-E' limit 1), (select id from courses where code = 'BBAI501' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-E' limit 1), (select id from courses where code = 'BTCS706N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-E' limit 1), (select id from courses where code = 'BTCS710' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-E' limit 1), (select id from courses where code = 'BTCS710(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-E' limit 1), (select id from courses where code = 'BTCS711' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-E' limit 1), (select id from courses where code = 'BTCS711(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-E' limit 1), (select id from courses where code = 'BTCS712(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-E' limit 1), (select id from courses where code = 'BTDSE722' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-E' limit 1), (select id from courses where code = 'BTDSE722(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-E' limit 1), (select id from courses where code = 'GU-SEM7' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-F' limit 1), (select id from courses where code = 'BBAI501' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-F' limit 1), (select id from courses where code = 'BTCS706N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-F' limit 1), (select id from courses where code = 'BTCS710' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-F' limit 1), (select id from courses where code = 'BTCS710(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-F' limit 1), (select id from courses where code = 'BTCS711' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-F' limit 1), (select id from courses where code = 'BTCS711(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-F' limit 1), (select id from courses where code = 'BTCS712(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-F' limit 1), (select id from courses where code = 'BTDSE722' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-F' limit 1), (select id from courses where code = 'BTDSE722(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-F' limit 1), (select id from courses where code = 'GU-SEM7' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-G' limit 1), (select id from courses where code = 'BBAI501' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-G' limit 1), (select id from courses where code = 'BTCS706N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-G' limit 1), (select id from courses where code = 'BTCS710' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-G' limit 1), (select id from courses where code = 'BTCS710(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-G' limit 1), (select id from courses where code = 'BTCS711' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-G' limit 1), (select id from courses where code = 'BTCS711(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-G' limit 1), (select id from courses where code = 'BTCS712(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-G' limit 1), (select id from courses where code = 'BTDSE722' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-G' limit 1), (select id from courses where code = 'BTDSE722(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-G' limit 1), (select id from courses where code = 'GU-SEM7' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-H' limit 1), (select id from courses where code = 'BBAI501' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-H' limit 1), (select id from courses where code = 'BTCS706N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-H' limit 1), (select id from courses where code = 'BTCS710' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-H' limit 1), (select id from courses where code = 'BTCS710(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-H' limit 1), (select id from courses where code = 'BTCS711' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-H' limit 1), (select id from courses where code = 'BTCS711(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-H' limit 1), (select id from courses where code = 'BTCS712(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-H' limit 1), (select id from courses where code = 'BTDSE722' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-H' limit 1), (select id from courses where code = 'BTDSE722(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-H' limit 1), (select id from courses where code = 'GU-SEM7' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-I' limit 1), (select id from courses where code = 'BBAI501' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-I' limit 1), (select id from courses where code = 'BTCS706N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-I' limit 1), (select id from courses where code = 'BTCS710' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-I' limit 1), (select id from courses where code = 'BTCS710(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-I' limit 1), (select id from courses where code = 'BTCS711' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-I' limit 1), (select id from courses where code = 'BTCS711(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-I' limit 1), (select id from courses where code = 'BTCS712(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-I' limit 1), (select id from courses where code = 'BTDSE722' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-I' limit 1), (select id from courses where code = 'BTDSE722(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-I' limit 1), (select id from courses where code = 'GU-SEM7' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-J' limit 1), (select id from courses where code = 'BBAI501' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-J' limit 1), (select id from courses where code = 'BTCS706N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-J' limit 1), (select id from courses where code = 'BTCS710' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-J' limit 1), (select id from courses where code = 'BTCS710(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-J' limit 1), (select id from courses where code = 'BTCS711' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-J' limit 1), (select id from courses where code = 'BTCS711(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-J' limit 1), (select id from courses where code = 'BTCS712(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-J' limit 1), (select id from courses where code = 'BTDSE722' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-J' limit 1), (select id from courses where code = 'BTDSE722(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'CSE-Y4-J' limit 1), (select id from courses where code = 'GU-SEM7' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y1-A' limit 1), (select id from courses where code = 'BTCS101M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y1-A' limit 1), (select id from courses where code = 'BTCS101M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y1-A' limit 1), (select id from courses where code = 'BTCS103M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y1-A' limit 1), (select id from courses where code = 'BTCS103M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y1-A' limit 1), (select id from courses where code = 'BTCS107M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y1-A' limit 1), (select id from courses where code = 'BTMA101N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y1-A' limit 1), (select id from courses where code = 'BTPH101' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y1-A' limit 1), (select id from courses where code = 'BTPH101(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y1-A' limit 1), (select id from courses where code = 'HUCS101' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y1-A' limit 1), (select id from courses where code = 'HUCS101(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y1-B' limit 1), (select id from courses where code = 'BTCS101M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y1-B' limit 1), (select id from courses where code = 'BTCS101M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y1-B' limit 1), (select id from courses where code = 'BTCS103M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y1-B' limit 1), (select id from courses where code = 'BTCS103M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y1-B' limit 1), (select id from courses where code = 'BTCS107M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y1-B' limit 1), (select id from courses where code = 'BTMA101N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y1-B' limit 1), (select id from courses where code = 'BTPH101' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y1-B' limit 1), (select id from courses where code = 'BTPH101(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y1-B' limit 1), (select id from courses where code = 'HUCS101' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y1-B' limit 1), (select id from courses where code = 'HUCS101(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y2-A' limit 1), (select id from courses where code = 'BTCS301N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y2-A' limit 1), (select id from courses where code = 'BTCS306M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y2-A' limit 1), (select id from courses where code = 'BTCS306M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y2-A' limit 1), (select id from courses where code = 'BTCS307M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y2-A' limit 1), (select id from courses where code = 'BTCS307M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y2-A' limit 1), (select id from courses where code = 'BTCS402N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y2-A' limit 1), (select id from courses where code = 'BTCS402N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y2-A' limit 1), (select id from courses where code = 'BTDSE322M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y2-A' limit 1), (select id from courses where code = 'BTDSE322M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y2-A' limit 1), (select id from courses where code = 'BTIT307N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y2-A' limit 1), (select id from courses where code = 'GU-SEM3' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y2-B' limit 1), (select id from courses where code = 'BTCS301N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y2-B' limit 1), (select id from courses where code = 'BTCS306M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y2-B' limit 1), (select id from courses where code = 'BTCS306M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y2-B' limit 1), (select id from courses where code = 'BTCS307M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y2-B' limit 1), (select id from courses where code = 'BTCS307M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y2-B' limit 1), (select id from courses where code = 'BTCS402N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y2-B' limit 1), (select id from courses where code = 'BTCS402N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y2-B' limit 1), (select id from courses where code = 'BTDSE322M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y2-B' limit 1), (select id from courses where code = 'BTDSE322M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y2-B' limit 1), (select id from courses where code = 'BTIT307N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y2-B' limit 1), (select id from courses where code = 'GU-SEM3' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y3-A' limit 1), (select id from courses where code = 'BTCS501N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y3-A' limit 1), (select id from courses where code = 'BTCS502N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y3-A' limit 1), (select id from courses where code = 'BTCS502N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y3-A' limit 1), (select id from courses where code = 'BTCS503M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y3-A' limit 1), (select id from courses where code = 'BTCS503M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y3-A' limit 1), (select id from courses where code = 'BTDSE511M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y3-A' limit 1), (select id from courses where code = 'BTDSE511M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y3-A' limit 1), (select id from courses where code = 'BTIT507M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y3-A' limit 1), (select id from courses where code = 'BTIT508M(p)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y3-A' limit 1), (select id from courses where code = 'GU-SEM5' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y3-B' limit 1), (select id from courses where code = 'BTCS501N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y3-B' limit 1), (select id from courses where code = 'BTCS502N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y3-B' limit 1), (select id from courses where code = 'BTCS502N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y3-B' limit 1), (select id from courses where code = 'BTCS503M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y3-B' limit 1), (select id from courses where code = 'BTCS503M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y3-B' limit 1), (select id from courses where code = 'BTDSE511M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y3-B' limit 1), (select id from courses where code = 'BTDSE511M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y3-B' limit 1), (select id from courses where code = 'BTIT507M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y3-B' limit 1), (select id from courses where code = 'BTIT508M(p)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y3-B' limit 1), (select id from courses where code = 'GU-SEM5' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y4-A' limit 1), (select id from courses where code = 'BBAI501' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y4-A' limit 1), (select id from courses where code = 'BTCS706N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y4-A' limit 1), (select id from courses where code = 'BTCS710' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y4-A' limit 1), (select id from courses where code = 'BTCS710(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y4-A' limit 1), (select id from courses where code = 'BTCS711' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y4-A' limit 1), (select id from courses where code = 'BTCS711(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y4-A' limit 1), (select id from courses where code = 'BTCS712(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y4-A' limit 1), (select id from courses where code = 'BTDSE722' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y4-A' limit 1), (select id from courses where code = 'BTDSE722(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y4-A' limit 1), (select id from courses where code = 'GU-SEM7' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y4-B' limit 1), (select id from courses where code = 'BBAI501' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y4-B' limit 1), (select id from courses where code = 'BTCS706N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y4-B' limit 1), (select id from courses where code = 'BTCS710' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y4-B' limit 1), (select id from courses where code = 'BTCS710(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y4-B' limit 1), (select id from courses where code = 'BTCS711' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y4-B' limit 1), (select id from courses where code = 'BTCS711(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y4-B' limit 1), (select id from courses where code = 'BTCS712(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y4-B' limit 1), (select id from courses where code = 'BTDSE722' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y4-B' limit 1), (select id from courses where code = 'BTDSE722(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'AIDS-Y4-B' limit 1), (select id from courses where code = 'GU-SEM7' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y1-A' limit 1), (select id from courses where code = 'BTCS101M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y1-A' limit 1), (select id from courses where code = 'BTCS101M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y1-A' limit 1), (select id from courses where code = 'BTCS103M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y1-A' limit 1), (select id from courses where code = 'BTCS103M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y1-A' limit 1), (select id from courses where code = 'BTCS107M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y1-A' limit 1), (select id from courses where code = 'BTMA101N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y1-A' limit 1), (select id from courses where code = 'BTPH101' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y1-A' limit 1), (select id from courses where code = 'BTPH101(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y1-A' limit 1), (select id from courses where code = 'HUCS101' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y1-A' limit 1), (select id from courses where code = 'HUCS101(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y1-B' limit 1), (select id from courses where code = 'BTCS101M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y1-B' limit 1), (select id from courses where code = 'BTCS101M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y1-B' limit 1), (select id from courses where code = 'BTCS103M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y1-B' limit 1), (select id from courses where code = 'BTCS103M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y1-B' limit 1), (select id from courses where code = 'BTCS107M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y1-B' limit 1), (select id from courses where code = 'BTMA101N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y1-B' limit 1), (select id from courses where code = 'BTPH101' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y1-B' limit 1), (select id from courses where code = 'BTPH101(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y1-B' limit 1), (select id from courses where code = 'HUCS101' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y1-B' limit 1), (select id from courses where code = 'HUCS101(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y1-C' limit 1), (select id from courses where code = 'BTCS101M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y1-C' limit 1), (select id from courses where code = 'BTCS101M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y1-C' limit 1), (select id from courses where code = 'BTCS103M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y1-C' limit 1), (select id from courses where code = 'BTCS103M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y1-C' limit 1), (select id from courses where code = 'BTCS107M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y1-C' limit 1), (select id from courses where code = 'BTMA101N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y1-C' limit 1), (select id from courses where code = 'BTPH101' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y1-C' limit 1), (select id from courses where code = 'BTPH101(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y1-C' limit 1), (select id from courses where code = 'HUCS101' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y1-C' limit 1), (select id from courses where code = 'HUCS101(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y1-D' limit 1), (select id from courses where code = 'BTCS101M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y1-D' limit 1), (select id from courses where code = 'BTCS101M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y1-D' limit 1), (select id from courses where code = 'BTCS103M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y1-D' limit 1), (select id from courses where code = 'BTCS103M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y1-D' limit 1), (select id from courses where code = 'BTCS107M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y1-D' limit 1), (select id from courses where code = 'BTMA101N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y1-D' limit 1), (select id from courses where code = 'BTPH101' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y1-D' limit 1), (select id from courses where code = 'BTPH101(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y1-D' limit 1), (select id from courses where code = 'HUCS101' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y1-D' limit 1), (select id from courses where code = 'HUCS101(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y2-A' limit 1), (select id from courses where code = 'BTCS301N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y2-A' limit 1), (select id from courses where code = 'BTCS306M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y2-A' limit 1), (select id from courses where code = 'BTCS306M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y2-A' limit 1), (select id from courses where code = 'BTCS307M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y2-A' limit 1), (select id from courses where code = 'BTCS307M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y2-A' limit 1), (select id from courses where code = 'BTCS402N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y2-A' limit 1), (select id from courses where code = 'BTCS402N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y2-A' limit 1), (select id from courses where code = 'BTDSE322M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y2-A' limit 1), (select id from courses where code = 'BTDSE322M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y2-A' limit 1), (select id from courses where code = 'BTIT307N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y2-A' limit 1), (select id from courses where code = 'GU-SEM3' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y2-B' limit 1), (select id from courses where code = 'BTCS301N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y2-B' limit 1), (select id from courses where code = 'BTCS306M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y2-B' limit 1), (select id from courses where code = 'BTCS306M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y2-B' limit 1), (select id from courses where code = 'BTCS307M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y2-B' limit 1), (select id from courses where code = 'BTCS307M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y2-B' limit 1), (select id from courses where code = 'BTCS402N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y2-B' limit 1), (select id from courses where code = 'BTCS402N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y2-B' limit 1), (select id from courses where code = 'BTDSE322M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y2-B' limit 1), (select id from courses where code = 'BTDSE322M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y2-B' limit 1), (select id from courses where code = 'BTIT307N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y2-B' limit 1), (select id from courses where code = 'GU-SEM3' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y2-C' limit 1), (select id from courses where code = 'BTCS301N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y2-C' limit 1), (select id from courses where code = 'BTCS306M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y2-C' limit 1), (select id from courses where code = 'BTCS306M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y2-C' limit 1), (select id from courses where code = 'BTCS307M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y2-C' limit 1), (select id from courses where code = 'BTCS307M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y2-C' limit 1), (select id from courses where code = 'BTCS402N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y2-C' limit 1), (select id from courses where code = 'BTCS402N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y2-C' limit 1), (select id from courses where code = 'BTDSE322M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y2-C' limit 1), (select id from courses where code = 'BTDSE322M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y2-C' limit 1), (select id from courses where code = 'BTIT307N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y2-C' limit 1), (select id from courses where code = 'GU-SEM3' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y2-D' limit 1), (select id from courses where code = 'BTCS301N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y2-D' limit 1), (select id from courses where code = 'BTCS306M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y2-D' limit 1), (select id from courses where code = 'BTCS306M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y2-D' limit 1), (select id from courses where code = 'BTCS307M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y2-D' limit 1), (select id from courses where code = 'BTCS307M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y2-D' limit 1), (select id from courses where code = 'BTCS402N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y2-D' limit 1), (select id from courses where code = 'BTCS402N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y2-D' limit 1), (select id from courses where code = 'BTDSE322M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y2-D' limit 1), (select id from courses where code = 'BTDSE322M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y2-D' limit 1), (select id from courses where code = 'BTIT307N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y2-D' limit 1), (select id from courses where code = 'GU-SEM3' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y3-A' limit 1), (select id from courses where code = 'BTCS501N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y3-A' limit 1), (select id from courses where code = 'BTCS502N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y3-A' limit 1), (select id from courses where code = 'BTCS502N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y3-A' limit 1), (select id from courses where code = 'BTCS503M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y3-A' limit 1), (select id from courses where code = 'BTCS503M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y3-A' limit 1), (select id from courses where code = 'BTDSE511M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y3-A' limit 1), (select id from courses where code = 'BTDSE511M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y3-A' limit 1), (select id from courses where code = 'BTIT507M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y3-A' limit 1), (select id from courses where code = 'BTIT508M(p)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y3-A' limit 1), (select id from courses where code = 'GU-SEM5' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y3-B' limit 1), (select id from courses where code = 'BTCS501N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y3-B' limit 1), (select id from courses where code = 'BTCS502N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y3-B' limit 1), (select id from courses where code = 'BTCS502N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y3-B' limit 1), (select id from courses where code = 'BTCS503M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y3-B' limit 1), (select id from courses where code = 'BTCS503M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y3-B' limit 1), (select id from courses where code = 'BTDSE511M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y3-B' limit 1), (select id from courses where code = 'BTDSE511M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y3-B' limit 1), (select id from courses where code = 'BTIT507M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y3-B' limit 1), (select id from courses where code = 'BTIT508M(p)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y3-B' limit 1), (select id from courses where code = 'GU-SEM5' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y3-C' limit 1), (select id from courses where code = 'BTCS501N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y3-C' limit 1), (select id from courses where code = 'BTCS502N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y3-C' limit 1), (select id from courses where code = 'BTCS502N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y3-C' limit 1), (select id from courses where code = 'BTCS503M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y3-C' limit 1), (select id from courses where code = 'BTCS503M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y3-C' limit 1), (select id from courses where code = 'BTDSE511M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y3-C' limit 1), (select id from courses where code = 'BTDSE511M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y3-C' limit 1), (select id from courses where code = 'BTIT507M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y3-C' limit 1), (select id from courses where code = 'BTIT508M(p)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y3-C' limit 1), (select id from courses where code = 'GU-SEM5' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y3-D' limit 1), (select id from courses where code = 'BTCS501N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y3-D' limit 1), (select id from courses where code = 'BTCS502N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y3-D' limit 1), (select id from courses where code = 'BTCS502N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y3-D' limit 1), (select id from courses where code = 'BTCS503M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y3-D' limit 1), (select id from courses where code = 'BTCS503M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y3-D' limit 1), (select id from courses where code = 'BTDSE511M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y3-D' limit 1), (select id from courses where code = 'BTDSE511M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y3-D' limit 1), (select id from courses where code = 'BTIT507M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y3-D' limit 1), (select id from courses where code = 'BTIT508M(p)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y3-D' limit 1), (select id from courses where code = 'GU-SEM5' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y4-A' limit 1), (select id from courses where code = 'BBAI501' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y4-A' limit 1), (select id from courses where code = 'BTCS706N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y4-A' limit 1), (select id from courses where code = 'BTCS710' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y4-A' limit 1), (select id from courses where code = 'BTCS710(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y4-A' limit 1), (select id from courses where code = 'BTCS711' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y4-A' limit 1), (select id from courses where code = 'BTCS711(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y4-A' limit 1), (select id from courses where code = 'BTCS712(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y4-A' limit 1), (select id from courses where code = 'BTDSE722' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y4-A' limit 1), (select id from courses where code = 'BTDSE722(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y4-A' limit 1), (select id from courses where code = 'GU-SEM7' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y4-B' limit 1), (select id from courses where code = 'BBAI501' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y4-B' limit 1), (select id from courses where code = 'BTCS706N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y4-B' limit 1), (select id from courses where code = 'BTCS710' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y4-B' limit 1), (select id from courses where code = 'BTCS710(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y4-B' limit 1), (select id from courses where code = 'BTCS711' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y4-B' limit 1), (select id from courses where code = 'BTCS711(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y4-B' limit 1), (select id from courses where code = 'BTCS712(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y4-B' limit 1), (select id from courses where code = 'BTDSE722' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y4-B' limit 1), (select id from courses where code = 'BTDSE722(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y4-B' limit 1), (select id from courses where code = 'GU-SEM7' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y4-C' limit 1), (select id from courses where code = 'BBAI501' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y4-C' limit 1), (select id from courses where code = 'BTCS706N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y4-C' limit 1), (select id from courses where code = 'BTCS710' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y4-C' limit 1), (select id from courses where code = 'BTCS710(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y4-C' limit 1), (select id from courses where code = 'BTCS711' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y4-C' limit 1), (select id from courses where code = 'BTCS711(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y4-C' limit 1), (select id from courses where code = 'BTCS712(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y4-C' limit 1), (select id from courses where code = 'BTDSE722' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y4-C' limit 1), (select id from courses where code = 'BTDSE722(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y4-C' limit 1), (select id from courses where code = 'GU-SEM7' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y4-D' limit 1), (select id from courses where code = 'BBAI501' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y4-D' limit 1), (select id from courses where code = 'BTCS706N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y4-D' limit 1), (select id from courses where code = 'BTCS710' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y4-D' limit 1), (select id from courses where code = 'BTCS710(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y4-D' limit 1), (select id from courses where code = 'BTCS711' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y4-D' limit 1), (select id from courses where code = 'BTCS711(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y4-D' limit 1), (select id from courses where code = 'BTCS712(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y4-D' limit 1), (select id from courses where code = 'BTDSE722' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y4-D' limit 1), (select id from courses where code = 'BTDSE722(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IT-Y4-D' limit 1), (select id from courses where code = 'GU-SEM7' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'TCS-Y1-A' limit 1), (select id from courses where code = 'BTCS101M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'TCS-Y1-A' limit 1), (select id from courses where code = 'BTCS101M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'TCS-Y1-A' limit 1), (select id from courses where code = 'BTCS103M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'TCS-Y1-A' limit 1), (select id from courses where code = 'BTCS103M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'TCS-Y1-A' limit 1), (select id from courses where code = 'BTCS107M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'TCS-Y1-A' limit 1), (select id from courses where code = 'BTMA101N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'TCS-Y1-A' limit 1), (select id from courses where code = 'BTPH101' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'TCS-Y1-A' limit 1), (select id from courses where code = 'BTPH101(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'TCS-Y1-A' limit 1), (select id from courses where code = 'HUCS101' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'TCS-Y1-A' limit 1), (select id from courses where code = 'HUCS101(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y1-A' limit 1), (select id from courses where code = 'BTCS101M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y1-A' limit 1), (select id from courses where code = 'BTCS101M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y1-A' limit 1), (select id from courses where code = 'BTCS103M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y1-A' limit 1), (select id from courses where code = 'BTCS103M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y1-A' limit 1), (select id from courses where code = 'BTCS107M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y1-A' limit 1), (select id from courses where code = 'BTMA101N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y1-A' limit 1), (select id from courses where code = 'BTPH101' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y1-A' limit 1), (select id from courses where code = 'BTPH101(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y1-A' limit 1), (select id from courses where code = 'HUCS101' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y1-A' limit 1), (select id from courses where code = 'HUCS101(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y1-B' limit 1), (select id from courses where code = 'BTCS101M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y1-B' limit 1), (select id from courses where code = 'BTCS101M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y1-B' limit 1), (select id from courses where code = 'BTCS103M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y1-B' limit 1), (select id from courses where code = 'BTCS103M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y1-B' limit 1), (select id from courses where code = 'BTCS107M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y1-B' limit 1), (select id from courses where code = 'BTMA101N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y1-B' limit 1), (select id from courses where code = 'BTPH101' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y1-B' limit 1), (select id from courses where code = 'BTPH101(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y1-B' limit 1), (select id from courses where code = 'HUCS101' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y1-B' limit 1), (select id from courses where code = 'HUCS101(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'APPLE-Y1-A' limit 1), (select id from courses where code = 'BTCS101M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'APPLE-Y1-A' limit 1), (select id from courses where code = 'BTCS101M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'APPLE-Y1-A' limit 1), (select id from courses where code = 'BTCS103M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'APPLE-Y1-A' limit 1), (select id from courses where code = 'BTCS103M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'APPLE-Y1-A' limit 1), (select id from courses where code = 'BTCS107M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'APPLE-Y1-A' limit 1), (select id from courses where code = 'BTMA101N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'APPLE-Y1-A' limit 1), (select id from courses where code = 'BTPH101' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'APPLE-Y1-A' limit 1), (select id from courses where code = 'BTPH101(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'APPLE-Y1-A' limit 1), (select id from courses where code = 'HUCS101' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'APPLE-Y1-A' limit 1), (select id from courses where code = 'HUCS101(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'TCS-Y2-A' limit 1), (select id from courses where code = 'BTCS301N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'TCS-Y2-A' limit 1), (select id from courses where code = 'BTCS306M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'TCS-Y2-A' limit 1), (select id from courses where code = 'BTCS306M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'TCS-Y2-A' limit 1), (select id from courses where code = 'BTCS307M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'TCS-Y2-A' limit 1), (select id from courses where code = 'BTCS307M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'TCS-Y2-A' limit 1), (select id from courses where code = 'BTCS402N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'TCS-Y2-A' limit 1), (select id from courses where code = 'BTCS402N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'TCS-Y2-A' limit 1), (select id from courses where code = 'BTDSE322M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'TCS-Y2-A' limit 1), (select id from courses where code = 'BTDSE322M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'TCS-Y2-A' limit 1), (select id from courses where code = 'BTIT307N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'TCS-Y2-A' limit 1), (select id from courses where code = 'GU-SEM3' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y2-A' limit 1), (select id from courses where code = 'BTCS301N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y2-A' limit 1), (select id from courses where code = 'BTCS306M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y2-A' limit 1), (select id from courses where code = 'BTCS306M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y2-A' limit 1), (select id from courses where code = 'BTCS307M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y2-A' limit 1), (select id from courses where code = 'BTCS307M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y2-A' limit 1), (select id from courses where code = 'BTCS402N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y2-A' limit 1), (select id from courses where code = 'BTCS402N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y2-A' limit 1), (select id from courses where code = 'BTDSE322M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y2-A' limit 1), (select id from courses where code = 'BTDSE322M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y2-A' limit 1), (select id from courses where code = 'BTIT307N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y2-A' limit 1), (select id from courses where code = 'GU-SEM3' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y2-B' limit 1), (select id from courses where code = 'BTCS301N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y2-B' limit 1), (select id from courses where code = 'BTCS306M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y2-B' limit 1), (select id from courses where code = 'BTCS306M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y2-B' limit 1), (select id from courses where code = 'BTCS307M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y2-B' limit 1), (select id from courses where code = 'BTCS307M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y2-B' limit 1), (select id from courses where code = 'BTCS402N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y2-B' limit 1), (select id from courses where code = 'BTCS402N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y2-B' limit 1), (select id from courses where code = 'BTDSE322M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y2-B' limit 1), (select id from courses where code = 'BTDSE322M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y2-B' limit 1), (select id from courses where code = 'BTIT307N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y2-B' limit 1), (select id from courses where code = 'GU-SEM3' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'APPLE-Y2-A' limit 1), (select id from courses where code = 'BTCS301N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'APPLE-Y2-A' limit 1), (select id from courses where code = 'BTCS306M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'APPLE-Y2-A' limit 1), (select id from courses where code = 'BTCS306M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'APPLE-Y2-A' limit 1), (select id from courses where code = 'BTCS307M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'APPLE-Y2-A' limit 1), (select id from courses where code = 'BTCS307M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'APPLE-Y2-A' limit 1), (select id from courses where code = 'BTCS402N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'APPLE-Y2-A' limit 1), (select id from courses where code = 'BTCS402N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'APPLE-Y2-A' limit 1), (select id from courses where code = 'BTDSE322M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'APPLE-Y2-A' limit 1), (select id from courses where code = 'BTDSE322M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'APPLE-Y2-A' limit 1), (select id from courses where code = 'BTIT307N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'APPLE-Y2-A' limit 1), (select id from courses where code = 'GU-SEM3' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'TCS-Y3-A' limit 1), (select id from courses where code = 'BTCS501N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'TCS-Y3-A' limit 1), (select id from courses where code = 'BTCS502N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'TCS-Y3-A' limit 1), (select id from courses where code = 'BTCS502N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'TCS-Y3-A' limit 1), (select id from courses where code = 'BTCS503M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'TCS-Y3-A' limit 1), (select id from courses where code = 'BTCS503M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'TCS-Y3-A' limit 1), (select id from courses where code = 'BTDSE511M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'TCS-Y3-A' limit 1), (select id from courses where code = 'BTDSE511M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'TCS-Y3-A' limit 1), (select id from courses where code = 'BTIT507M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'TCS-Y3-A' limit 1), (select id from courses where code = 'BTIT508M(p)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'TCS-Y3-A' limit 1), (select id from courses where code = 'GU-SEM5' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y3-A' limit 1), (select id from courses where code = 'BTCS501N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y3-A' limit 1), (select id from courses where code = 'BTCS502N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y3-A' limit 1), (select id from courses where code = 'BTCS502N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y3-A' limit 1), (select id from courses where code = 'BTCS503M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y3-A' limit 1), (select id from courses where code = 'BTCS503M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y3-A' limit 1), (select id from courses where code = 'BTDSE511M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y3-A' limit 1), (select id from courses where code = 'BTDSE511M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y3-A' limit 1), (select id from courses where code = 'BTIT507M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y3-A' limit 1), (select id from courses where code = 'BTIT508M(p)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y3-A' limit 1), (select id from courses where code = 'GU-SEM5' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y3-B' limit 1), (select id from courses where code = 'BTCS501N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y3-B' limit 1), (select id from courses where code = 'BTCS502N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y3-B' limit 1), (select id from courses where code = 'BTCS502N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y3-B' limit 1), (select id from courses where code = 'BTCS503M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y3-B' limit 1), (select id from courses where code = 'BTCS503M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y3-B' limit 1), (select id from courses where code = 'BTDSE511M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y3-B' limit 1), (select id from courses where code = 'BTDSE511M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y3-B' limit 1), (select id from courses where code = 'BTIT507M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y3-B' limit 1), (select id from courses where code = 'BTIT508M(p)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y3-B' limit 1), (select id from courses where code = 'GU-SEM5' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'APPLE-Y3-A' limit 1), (select id from courses where code = 'BTCS501N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'APPLE-Y3-A' limit 1), (select id from courses where code = 'BTCS502N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'APPLE-Y3-A' limit 1), (select id from courses where code = 'BTCS502N(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'APPLE-Y3-A' limit 1), (select id from courses where code = 'BTCS503M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'APPLE-Y3-A' limit 1), (select id from courses where code = 'BTCS503M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'APPLE-Y3-A' limit 1), (select id from courses where code = 'BTDSE511M' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'APPLE-Y3-A' limit 1), (select id from courses where code = 'BTDSE511M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'APPLE-Y3-A' limit 1), (select id from courses where code = 'BTIT507M(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'APPLE-Y3-A' limit 1), (select id from courses where code = 'BTIT508M(p)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'APPLE-Y3-A' limit 1), (select id from courses where code = 'GU-SEM5' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'TCS-Y4-A' limit 1), (select id from courses where code = 'BBAI501' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'TCS-Y4-A' limit 1), (select id from courses where code = 'BTCS706N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'TCS-Y4-A' limit 1), (select id from courses where code = 'BTCS710' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'TCS-Y4-A' limit 1), (select id from courses where code = 'BTCS710(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'TCS-Y4-A' limit 1), (select id from courses where code = 'BTCS711' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'TCS-Y4-A' limit 1), (select id from courses where code = 'BTCS711(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'TCS-Y4-A' limit 1), (select id from courses where code = 'BTCS712(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'TCS-Y4-A' limit 1), (select id from courses where code = 'BTDSE722' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'TCS-Y4-A' limit 1), (select id from courses where code = 'BTDSE722(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'TCS-Y4-A' limit 1), (select id from courses where code = 'GU-SEM7' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y4-A' limit 1), (select id from courses where code = 'BBAI501' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y4-A' limit 1), (select id from courses where code = 'BTCS706N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y4-A' limit 1), (select id from courses where code = 'BTCS710' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y4-A' limit 1), (select id from courses where code = 'BTCS710(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y4-A' limit 1), (select id from courses where code = 'BTCS711' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y4-A' limit 1), (select id from courses where code = 'BTCS711(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y4-A' limit 1), (select id from courses where code = 'BTCS712(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y4-A' limit 1), (select id from courses where code = 'BTDSE722' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y4-A' limit 1), (select id from courses where code = 'BTDSE722(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y4-A' limit 1), (select id from courses where code = 'GU-SEM7' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y4-B' limit 1), (select id from courses where code = 'BBAI501' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y4-B' limit 1), (select id from courses where code = 'BTCS706N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y4-B' limit 1), (select id from courses where code = 'BTCS710' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y4-B' limit 1), (select id from courses where code = 'BTCS710(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y4-B' limit 1), (select id from courses where code = 'BTCS711' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y4-B' limit 1), (select id from courses where code = 'BTCS711(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y4-B' limit 1), (select id from courses where code = 'BTCS712(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y4-B' limit 1), (select id from courses where code = 'BTDSE722' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y4-B' limit 1), (select id from courses where code = 'BTDSE722(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'IBM-Y4-B' limit 1), (select id from courses where code = 'GU-SEM7' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'APPLE-Y4-A' limit 1), (select id from courses where code = 'BBAI501' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'APPLE-Y4-A' limit 1), (select id from courses where code = 'BTCS706N' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'APPLE-Y4-A' limit 1), (select id from courses where code = 'BTCS710' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'APPLE-Y4-A' limit 1), (select id from courses where code = 'BTCS710(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'APPLE-Y4-A' limit 1), (select id from courses where code = 'BTCS711' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'APPLE-Y4-A' limit 1), (select id from courses where code = 'BTCS711(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'APPLE-Y4-A' limit 1), (select id from courses where code = 'BTCS712(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'APPLE-Y4-A' limit 1), (select id from courses where code = 'BTDSE722' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'APPLE-Y4-A' limit 1), (select id from courses where code = 'BTDSE722(P)' limit 1));
  insert into section_courses (section_id, course_id)
  values ((select id from sections where code = 'APPLE-Y4-A' limit 1), (select id from courses where code = 'GU-SEM7' limit 1));

  -- -------------------------------------------------------------------------
  -- 11. Generic Elective Reserved Slot Blocks (Thu & Fri Last Two Periods of Each Shift)
  -- -------------------------------------------------------------------------
  insert into elective_slot_blocks (time_slot_id)
  select id from time_slots
  where institution_id = v_inst
    and day_of_week in (4, 5)
    and period in (5, 6, 7, 8);

  -- -------------------------------------------------------------------------
  -- 12. Optimization Weights
  -- -------------------------------------------------------------------------
  insert into constraints (institution_id, key, value, kind) values
    (v_inst, 'gap_weight', '{"value": 10}', 'soft'),
    (v_inst, 'day_spread_weight', '{"value": 5}', 'soft'),
    (v_inst, 'load_balance_weight', '{"value": 5}', 'soft');

end $$;
