-- TS-SC: Clean Reset & Fresh Seed Script
-- 1. Safely ensures all schema columns from migrations 0001-0005 exist.
-- 2. Wipes all old timetable, academic, and entity records completely.
-- 3. Seeds fresh institutional data with Theory & Practical course separation and Lab Batches.

-- Step 1: Ensure required columns exist from migrations 0003, 0004, 0005
alter table if exists courses
  add column if not exists is_elective boolean not null default false;

alter table if exists timetable_versions
  add column if not exists violations jsonb not null default '{}';

alter table if exists sections
  add column if not exists batch_count int not null default 1 check (batch_count >= 1);

alter table if exists timetable_entries
  add column if not exists batch int default null check (batch is null or batch >= 1);

create index if not exists timetable_entries_batch_idx on timetable_entries (section_id, batch);

-- Step 2: Wipe all previous data & seed freshly in a single atomic transaction
do $$
declare
  v_inst uuid;
  v_dept uuid;
  v_prog uuid;
  v_sec_a uuid;
  v_sec_b uuid;
  v_f1 uuid; v_f2 uuid; v_f3 uuid;
  v_c1 uuid; v_c1p uuid; v_c2 uuid; v_c2p uuid; v_c3 uuid;
  v_r1 uuid; v_r2 uuid; v_r3 uuid; v_r4 uuid;
  d int; p int;
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
  delete from faculty_qualifications;
  delete from elective_slot_blocks;
  delete from constraints;
  delete from time_slots;

  -- Wipe previous core entities
  delete from courses;
  delete from rooms;
  delete from sections;
  delete from programs;
  delete from departments;
  delete from faculty;
  delete from institutions;

  -- ----------------------------------------------------
  -- Fresh Institutional Seed
  -- ----------------------------------------------------
  insert into institutions (name) values ('Demo Institute') returning id into v_inst;
  insert into departments (institution_id, name) values (v_inst, 'Computer Science') returning id into v_dept;
  insert into programs (department_id, name) values (v_dept, 'B.Tech CSE') returning id into v_prog;

  -- Sections with 2 lab batches (B1 and B2)
  insert into sections (program_id, name, semester, strength, batch_count)
    values (v_prog, 'CSE-A', 5, 60, 2) returning id into v_sec_a;
  insert into sections (program_id, name, semester, strength, batch_count)
    values (v_prog, 'CSE-B', 5, 58, 2) returning id into v_sec_b;

  -- Classrooms (cap 70 for whole section) & Labs (cap 35 for each batch of ~30)
  insert into rooms (institution_id, name, room_type, capacity)
    values (v_inst, 'R-101', 'classroom', 70) returning id into v_r1;
  insert into rooms (institution_id, name, room_type, capacity)
    values (v_inst, 'R-102', 'classroom', 70) returning id into v_r2;
  insert into rooms (institution_id, name, room_type, capacity, equipment_tags)
    values (v_inst, 'Lab-1', 'lab', 35, '{computers,projector}') returning id into v_r3;
  insert into rooms (institution_id, name, room_type, capacity, equipment_tags)
    values (v_inst, 'Lab-2', 'lab', 35, '{computers,gpus}') returning id into v_r4;

  -- Faculty instructors
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
    values (v_inst, 'Asha Sharma', 'asha.sharma@demo.edu', v_dept, 18) returning id into v_f1;
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
    values (v_inst, 'Rohit Verma', 'rohit.verma@demo.edu', v_dept, 18) returning id into v_f2;
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
    values (v_inst, 'Neha Khan', 'neha.khan@demo.edu', v_dept, 18) returning id into v_f3;

  -- Distinct Theory and Practical/Lab courses
  insert into courses (department_id, code, name, sessions_per_week, lab_required)
    values (v_dept, 'CS501', 'Operating Systems (Theory)', 3, false) returning id into v_c1;
  insert into courses (department_id, code, name, sessions_per_week, lab_required)
    values (v_dept, 'CS501P', 'Operating Systems Lab (Practical)', 2, true) returning id into v_c1p;
  insert into courses (department_id, code, name, sessions_per_week, lab_required)
    values (v_dept, 'CS502', 'Database Systems (Theory)', 3, false) returning id into v_c2;
  insert into courses (department_id, code, name, sessions_per_week, lab_required)
    values (v_dept, 'CS502P', 'Database Systems Lab (Practical)', 2, true) returning id into v_c2p;
  insert into courses (department_id, code, name, sessions_per_week, lab_required)
    values (v_dept, 'CS503', 'Computer Networks (Theory)', 3, false) returning id into v_c3;

  -- Faculty Qualifications
  insert into faculty_qualifications (faculty_id, course_id) values
    (v_f1, v_c1), (v_f1, v_c1p), (v_f1, v_c3),
    (v_f2, v_c2), (v_f2, v_c2p), (v_f2, v_c1), (v_f2, v_c1p),
    (v_f3, v_c3), (v_f3, v_c2p), (v_f3, v_c1p);

  -- Section Course Assignments
  insert into section_courses (section_id, course_id) values
    (v_sec_a, v_c1), (v_sec_a, v_c1p), (v_sec_a, v_c2), (v_sec_a, v_c2p), (v_sec_a, v_c3),
    (v_sec_b, v_c1), (v_sec_b, v_c1p), (v_sec_b, v_c2), (v_sec_b, v_c2p), (v_sec_b, v_c3);

  -- Time Slots: Mon–Fri, 6 periods/day, 09:00–15:00 with lunch hour
  for d in 1..5 loop
    for p in 1..6 loop
      insert into time_slots (institution_id, day_of_week, period, starts_at, ends_at)
      values (
        v_inst, d, p,
        (time '09:00' + ((p - 1) + case when p > 3 then 1 else 0 end) * interval '1 hour'),
        (time '10:00' + ((p - 1) + case when p > 3 then 1 else 0 end) * interval '1 hour')
      );
    end loop;
  end loop;

  -- Default soft-constraint weights
  insert into constraints (institution_id, key, value, kind) values
    (v_inst, 'gap_weight', '{"value": 10}', 'soft'),
    (v_inst, 'day_spread_weight', '{"value": 5}', 'soft'),
    (v_inst, 'load_balance_weight', '{"value": 5}', 'soft');
end $$;
