-- TS-SC demo seed (Phase 1) — small but realistic dataset.
-- Run after migrations/0001_initial_schema.sql

do $$
declare
  v_inst uuid;
  v_dept uuid;
  v_prog uuid;
  v_sec_a uuid;
  v_sec_b uuid;
  v_f1 uuid; v_f2 uuid; v_f3 uuid;
  v_c1 uuid; v_c2 uuid; v_c3 uuid;
  v_r1 uuid; v_r2 uuid; v_r3 uuid;
  d int; p int;
begin
  insert into institutions (name) values ('Demo Institute') returning id into v_inst;
  insert into departments (institution_id, name) values (v_inst, 'Computer Science') returning id into v_dept;
  insert into programs (department_id, name) values (v_dept, 'B.Tech CSE') returning id into v_prog;

  insert into sections (program_id, name, semester, strength)
    values (v_prog, 'CSE-A', 5, 60) returning id into v_sec_a;
  insert into sections (program_id, name, semester, strength)
    values (v_prog, 'CSE-B', 5, 58) returning id into v_sec_b;

  insert into rooms (institution_id, name, room_type, capacity)
    values (v_inst, 'R-101', 'classroom', 70) returning id into v_r1;
  insert into rooms (institution_id, name, room_type, capacity)
    values (v_inst, 'R-102', 'classroom', 70) returning id into v_r2;
  insert into rooms (institution_id, name, room_type, capacity, equipment_tags)
    values (v_inst, 'Lab-1', 'lab', 35, '{computers,projector}') returning id into v_r3;

  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
    values (v_inst, 'Asha Sharma', 'asha.sharma@demo.edu', v_dept, 18) returning id into v_f1;
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
    values (v_inst, 'Rohit Verma', 'rohit.verma@demo.edu', v_dept, 16) returning id into v_f2;
  insert into faculty (institution_id, name, email, department_id, max_weekly_load)
    values (v_inst, 'Neha Khan', 'neha.khan@demo.edu', v_dept, 16) returning id into v_f3;

  insert into courses (department_id, code, name, sessions_per_week, lab_required)
    values (v_dept, 'CS501', 'Operating Systems', 4, false) returning id into v_c1;
  insert into courses (department_id, code, name, sessions_per_week, lab_required)
    values (v_dept, 'CS502', 'Database Systems', 4, true) returning id into v_c2;
  insert into courses (department_id, code, name, sessions_per_week, lab_required)
    values (v_dept, 'CS503', 'Computer Networks', 3, false) returning id into v_c3;

  insert into faculty_qualifications (faculty_id, course_id) values
    (v_f1, v_c1), (v_f1, v_c3),
    (v_f2, v_c2), (v_f2, v_c1),
    (v_f3, v_c3), (v_f3, v_c2);

  -- Mon–Fri, 6 periods/day, 09:00–15:00 with an hour lunch after period 3
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

  -- default soft-constraint weights
  insert into constraints (institution_id, key, value, kind) values
    (v_inst, 'gap_weight', '{"value": 10}', 'soft'),
    (v_inst, 'day_spread_weight', '{"value": 5}', 'soft'),
    (v_inst, 'load_balance_weight', '{"value": 5}', 'soft');
end $$;
