-- TS-SC: Clean Reset & Fresh Seed Script
-- 1. Safely ensures all schema columns from migrations 0001-0005 exist.
-- 2. Wipes all old timetable, academic, and entity records completely.
-- 3. Seeds realistic institutional dataset:
--    - 10 Student Sections (CSE-A to CSE-J) with 2 batches each (B1, B2)
--    - 5 Theory & Practical Subject Areas:
--        * Intro to Quantum Computing (Theory: 3/wk, Practical: 2/wk)
--        * Deep Learning (Theory: 3/wk, Practical: 2/wk)
--        * Prompt Engineering (Theory: 3/wk, Practical: 2/wk)
--        * Human Values & Professional Ethics (Theory: 3/wk)
--        * Cloud Competency (Practical: 2/wk)
--    - Minimum required faculty (16 instructors, max load 18 hrs/wk)
--    - 10 Classrooms (cap 70) and 8 Computer/Hardware Labs (cap 35)
--    - Standard 5-day week, 6 periods/day (09:00 - 15:00)

-- Step 1: Ensure required columns exist from migrations 0003, 0004, 0005
alter table if exists courses
  add column if not exists is_elective boolean not null default false;

alter table if exists timetable_versions
  add column if not exists violations jsonb not null default '{}';

alter table if exists sections
  add column if not exists batch_count int not null default 1 check (batch_count >= 1),
  add column if not exists code text unique,
  add column if not exists passkey text not null default substring(md5(random()::text), 1, 6);

alter table if exists timetable_entries
  add column if not exists batch int default null check (batch is null or batch >= 1);

create index if not exists timetable_entries_batch_idx on timetable_entries (section_id, batch);

-- Step 2: Wipe all previous data & seed freshly in a single atomic transaction
do $$
declare
  v_inst uuid;
  v_dept uuid;
  v_prog uuid;
  
  -- Courses
  v_qc uuid; v_qcp uuid;
  v_dl uuid; v_dlp uuid;
  v_pe uuid; v_pep uuid;
  v_hv uuid;
  v_ccp uuid;
  
  -- Arrays for batch operations
  v_sec_ids uuid[] := array[]::uuid[];
  v_fac_ids uuid[] := array[]::uuid[];
  
  v_sec_id uuid;
  v_fac_id uuid;
  v_room_id uuid;
  
  i int;
  d int; p int;
  
  sec_names text[] := array[
    'CSE-A', 'CSE-B', 'CSE-C', 'CSE-D', 'CSE-E',
    'CSE-F', 'CSE-G', 'CSE-H', 'CSE-I', 'CSE-J'
  ];
  
  faculty_names text[] := array[
    'Dr. Arpit Agrawal',       -- QC, QCP
    'Prof. Bhavna Sharma',     -- QC, QCP
    'Dr. Chetan Verma',        -- QC, QCP, CCP
    'Prof. Divya Patel',       -- QC, QCP, DL
    'Dr. Eshan Gupta',         -- DL, DLP
    'Prof. Fatima Khan',       -- DL, DLP
    'Dr. Gaurav Mehta',        -- DL, DLP, CCP
    'Prof. Harshit Joshi',     -- DL, DLP, PE
    'Dr. Ishita Roy',          -- PE, PEP
    'Prof. Jatin Saxena',      -- PE, PEP
    'Dr. Kavita Nair',         -- PE, PEP, CCP
    'Prof. Lalit Mishra',      -- PE, PEP, HV
    'Dr. Meenakshi Sundaram',  -- HV, CCP
    'Prof. Nitin Gadre',       -- HV, CCP
    'Dr. Omkar Deshmukh',      -- HV, CCP
    'Prof. Priya Sen'          -- HV, CCP, PEP
  ];

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
  -- 1. Institution, Department, Program
  -- ----------------------------------------------------
  insert into institutions (name) values ('Institute of Engineering & Technology') returning id into v_inst;
  insert into departments (institution_id, name) values (v_inst, 'Computer Science & Engineering') returning id into v_dept;
  insert into programs (department_id, name) values (v_dept, 'B.Tech CSE (Year 3 / Sem 5)') returning id into v_prog;

  -- ----------------------------------------------------
  -- 2. 10 Sections (CSE-A to CSE-J) with 2 batches each
  -- ----------------------------------------------------
  for i in 1..10 loop
    insert into sections (program_id, name, semester, strength, batch_count, code, passkey)
    values (
      v_prog,
      sec_names[i],
      5,
      60,
      2,
      'BTCS27' || right(sec_names[i], 1),
      right(sec_names[i], 1) || '-' || (7000 + i * 27)::text
    )
    returning id into v_sec_id;
    
    v_sec_ids := array_append(v_sec_ids, v_sec_id);
  end loop;

  -- ----------------------------------------------------
  -- 3. Classrooms (cap 70) and Labs (cap 35)
  -- ----------------------------------------------------
  -- 15 Theory Classrooms (Rooms 101 to 115, fixed per section)
  for i in 1..15 loop
    insert into rooms (institution_id, name, room_type, capacity)
    values (v_inst, 'CR-' || (100 + i), 'classroom', 70);
  end loop;

  -- 8 Specialized Computer & Hardware Labs
  for i in 1..8 loop
    insert into rooms (institution_id, name, room_type, capacity, equipment_tags)
    values (
      v_inst,
      'Lab-' || i,
      'lab',
      35,
      case 
        when i in (1, 2) then array['quantum_simulators', 'qiskit_workstations']
        when i in (3, 4) then array['gpu_clusters', 'cuda_workstations']
        when i in (5, 6) then array['llm_sandboxes', 'cloud_terminals']
        else array['cloud_vms', 'networking_racks']
      end
    );
  end loop;

  -- ----------------------------------------------------
  -- 4. Courses (Specified Curriculum)
  -- ----------------------------------------------------
  -- 1. Intro to Quantum Computing
  insert into courses (department_id, code, name, sessions_per_week, lab_required)
    values (v_dept, 'CS501', 'Intro to Quantum Computing (Theory)', 3, false) returning id into v_qc;
  insert into courses (department_id, code, name, sessions_per_week, lab_required)
    values (v_dept, 'CS501P', 'Quantum Computing Practical (Lab)', 2, true) returning id into v_qcp;

  -- 2. Deep Learning
  insert into courses (department_id, code, name, sessions_per_week, lab_required)
    values (v_dept, 'CS502', 'Deep Learning (Theory)', 3, false) returning id into v_dl;
  insert into courses (department_id, code, name, sessions_per_week, lab_required)
    values (v_dept, 'CS502P', 'Deep Learning Practical (Lab)', 2, true) returning id into v_dlp;

  -- 3. Prompt Engineering
  insert into courses (department_id, code, name, sessions_per_week, lab_required)
    values (v_dept, 'CS503', 'Prompt Engineering (Theory)', 3, false) returning id into v_pe;
  insert into courses (department_id, code, name, sessions_per_week, lab_required)
    values (v_dept, 'CS503P', 'Prompt Engineering Practical (Lab)', 2, true) returning id into v_pep;

  -- 4. Human Values
  insert into courses (department_id, code, name, sessions_per_week, lab_required)
    values (v_dept, 'HM504', 'Human Values & Professional Ethics (Theory)', 3, false) returning id into v_hv;

  -- 5. Cloud Competency Practical
  insert into courses (department_id, code, name, sessions_per_week, lab_required)
    values (v_dept, 'CS505P', 'Cloud Competency Practical (Lab)', 2, true) returning id into v_ccp;

  -- ----------------------------------------------------
  -- 5. 16 Minimum Faculty Instructors (max_weekly_load 18 hrs)
  -- ----------------------------------------------------
  for i in 1..16 loop
    insert into faculty (institution_id, name, email, department_id, max_weekly_load)
    values (
      v_inst,
      faculty_names[i],
      lower(replace(faculty_names[i], ' ', '.')) || '@iet.edu',
      v_dept,
      18
    ) returning id into v_fac_id;
    
    v_fac_ids := array_append(v_fac_ids, v_fac_id);
  end loop;

  -- ----------------------------------------------------
  -- 6. Faculty Subject Qualifications
  -- ----------------------------------------------------
  -- Faculty 1-4: Quantum Computing Theory & Lab
  insert into faculty_qualifications (faculty_id, course_id) values
    (v_fac_ids[1], v_qc), (v_fac_ids[1], v_qcp),
    (v_fac_ids[2], v_qc), (v_fac_ids[2], v_qcp),
    (v_fac_ids[3], v_qc), (v_fac_ids[3], v_qcp), (v_fac_ids[3], v_ccp),
    (v_fac_ids[4], v_qc), (v_fac_ids[4], v_qcp), (v_fac_ids[4], v_dl);

  -- Faculty 5-8: Deep Learning Theory & Lab
  insert into faculty_qualifications (faculty_id, course_id) values
    (v_fac_ids[5], v_dl), (v_fac_ids[5], v_dlp),
    (v_fac_ids[6], v_dl), (v_fac_ids[6], v_dlp),
    (v_fac_ids[7], v_dl), (v_fac_ids[7], v_dlp), (v_fac_ids[7], v_ccp),
    (v_fac_ids[8], v_dl), (v_fac_ids[8], v_dlp), (v_fac_ids[8], v_pe);

  -- Faculty 9-12: Prompt Engineering Theory & Lab
  insert into faculty_qualifications (faculty_id, course_id) values
    (v_fac_ids[9], v_pe), (v_fac_ids[9], v_pep),
    (v_fac_ids[10], v_pe), (v_fac_ids[10], v_pep),
    (v_fac_ids[11], v_pe), (v_fac_ids[11], v_pep), (v_fac_ids[11], v_ccp),
    (v_fac_ids[12], v_pe), (v_fac_ids[12], v_pep), (v_fac_ids[12], v_hv);

  -- Faculty 13-16: Human Values & Cloud Competency Practical
  insert into faculty_qualifications (faculty_id, course_id) values
    (v_fac_ids[13], v_hv), (v_fac_ids[13], v_ccp),
    (v_fac_ids[14], v_hv), (v_fac_ids[14], v_ccp),
    (v_fac_ids[15], v_hv), (v_fac_ids[15], v_ccp),
    (v_fac_ids[16], v_hv), (v_fac_ids[16], v_ccp), (v_fac_ids[16], v_pep);

  -- ----------------------------------------------------
  -- 7. Section-Course Curriculum Mapping (for all 10 sections)
  -- ----------------------------------------------------
  foreach v_sec_id in array v_sec_ids loop
    insert into section_courses (section_id, course_id) values
      (v_sec_id, v_qc),
      (v_sec_id, v_qcp),
      (v_sec_id, v_dl),
      (v_sec_id, v_dlp),
      (v_sec_id, v_pe),
      (v_sec_id, v_pep),
      (v_sec_id, v_hv),
      (v_sec_id, v_ccp);
  end loop;

  -- ----------------------------------------------------
  -- 8. Time Slots: Monday–Friday, 6 periods/day (09:00 - 15:00)
  -- ----------------------------------------------------
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

  -- ----------------------------------------------------
  -- 9. Optimization Weights
  -- ----------------------------------------------------
  insert into constraints (institution_id, key, value, kind) values
    (v_inst, 'gap_weight', '{"value": 10}', 'soft'),
    (v_inst, 'day_spread_weight', '{"value": 5}', 'soft'),
    (v_inst, 'load_balance_weight', '{"value": 5}', 'soft');

end $$;
