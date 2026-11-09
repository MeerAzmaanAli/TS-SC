-- Seed program_courses and update courses.semester based on data/institutional/courses.csv
do $$
declare
  r_prog record;
  v_course_id uuid;
  v_sem int;
begin
  -- 1. Update courses table with their respective semester from courses.csv
  update public.courses set semester = 1 where code = 'BTCS101M';
  update public.courses set semester = 1 where code = 'BTCS101M(P)';
  update public.courses set semester = 1 where code = 'BTCS103M';
  update public.courses set semester = 1 where code = 'BTCS103M(P)';
  update public.courses set semester = 1 where code = 'BTCS107M(P)';
  update public.courses set semester = 1 where code = 'BTMA101N';
  update public.courses set semester = 1 where code = 'BTPH101';
  update public.courses set semester = 1 where code = 'BTPH101(P)';
  update public.courses set semester = 1 where code = 'HUCS101';
  update public.courses set semester = 1 where code = 'HUCS101(P)';
  update public.courses set semester = 2 where code = 'BTCS102M';
  update public.courses set semester = 2 where code = 'BTCS102M(P)';
  update public.courses set semester = 2 where code = 'BTCS202M';
  update public.courses set semester = 2 where code = 'BTCS202M(P)';
  update public.courses set semester = 2 where code = 'BTEC104';
  update public.courses set semester = 2 where code = 'BTEC104(P)';
  update public.courses set semester = 2 where code = 'BTIT201M';
  update public.courses set semester = 2 where code = 'BTIT208M(P)';
  update public.courses set semester = 2 where code = 'BTMA201N';
  update public.courses set semester = 3 where code = 'BTCS301N';
  update public.courses set semester = 3 where code = 'BTCS306M';
  update public.courses set semester = 3 where code = 'BTCS306M(P)';
  update public.courses set semester = 3 where code = 'BTCS307M';
  update public.courses set semester = 3 where code = 'BTCS307M(P)';
  update public.courses set semester = 3 where code = 'BTCS402N';
  update public.courses set semester = 3 where code = 'BTCS402N(P)';
  update public.courses set semester = 3 where code = 'BTDSE322M';
  update public.courses set semester = 3 where code = 'BTDSE322M(P)';
  update public.courses set semester = 3 where code = 'BTIT307N(P)';
  update public.courses set semester = 3 where code = 'GU-SEM3';
  update public.courses set semester = 4 where code = 'BTCS302N';
  update public.courses set semester = 4 where code = 'BTCS302N(P)';
  update public.courses set semester = 4 where code = 'BTCS401N';
  update public.courses set semester = 4 where code = 'BTCS401N(P)';
  update public.courses set semester = 4 where code = 'BTDSE423M';
  update public.courses set semester = 4 where code = 'BTDSE423M(P)';
  update public.courses set semester = 4 where code = 'BTIT301N';
  update public.courses set semester = 4 where code = 'BTIT301N(P)';
  update public.courses set semester = 4 where code = 'BTIT410M(P)';
  update public.courses set semester = 4 where code = 'ML307';
  update public.courses set semester = 5 where code = 'BTCS501N';
  update public.courses set semester = 5 where code = 'BTCS502N';
  update public.courses set semester = 5 where code = 'BTCS502N(P)';
  update public.courses set semester = 5 where code = 'BTCS503M';
  update public.courses set semester = 5 where code = 'BTCS503M(P)';
  update public.courses set semester = 5 where code = 'BTDSE511M';
  update public.courses set semester = 5 where code = 'BTDSE511M(P)';
  update public.courses set semester = 5 where code = 'BTIT507M(P)';
  update public.courses set semester = 5 where code = 'BTIT508M(p)';
  update public.courses set semester = 5 where code = 'GU-SEM5';
  update public.courses set semester = 6 where code = 'BTCS601N';
  update public.courses set semester = 6 where code = 'BTCS601N(P)';
  update public.courses set semester = 6 where code = 'BTCS602N';
  update public.courses set semester = 6 where code = 'BTCS602N(P)';
  update public.courses set semester = 6 where code = 'BTCS603N';
  update public.courses set semester = 6 where code = 'BTCS603N(P)';
  update public.courses set semester = 6 where code = 'BTCS607N';
  update public.courses set semester = 6 where code = 'BTCS708N';
  update public.courses set semester = 6 where code = 'BTCS708N(P)';
  update public.courses set semester = 6 where code = 'BTDSE613M';
  update public.courses set semester = 7 where code = 'BBAI501';
  update public.courses set semester = 7 where code = 'BTCS706N';
  update public.courses set semester = 7 where code = 'BTCS710';
  update public.courses set semester = 7 where code = 'BTCS710(P)';
  update public.courses set semester = 7 where code = 'BTCS711';
  update public.courses set semester = 7 where code = 'BTCS711(P)';
  update public.courses set semester = 7 where code = 'BTCS712(P)';
  update public.courses set semester = 7 where code = 'BTDSE722';
  update public.courses set semester = 7 where code = 'BTDSE722(P)';
  update public.courses set semester = 7 where code = 'GU-SEM7';

  -- 2. Clear existing program_courses to avoid duplicates
  delete from public.program_courses;

  -- 3. Insert syllabus scheme (program_courses) for each program matching its active semesters
  for r_prog in select id, name from public.programs loop
    -- Determine default semester from program name
    if r_prog.name ~* 'Year 1' then v_sem := 1;
    elsif r_prog.name ~* 'Year 2' then v_sem := 3;
    elsif r_prog.name ~* 'Year 3' then v_sem := 5;
    elsif r_prog.name ~* 'Year 4' then v_sem := 7;
    else v_sem := 1;
    end if;

    -- Insert primary semester syllabus courses for this program
    if v_sem = 1 then
      select id into v_course_id from public.courses where code = 'BTCS101M' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 1, 4)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTCS101M(P)' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 1, 1)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTCS103M' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 1, 4)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTCS103M(P)' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 1, 1)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTCS107M(P)' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 1, 1)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTMA101N' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 1, 4)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTPH101' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 1, 4)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTPH101(P)' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 1, 1)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'HUCS101' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 1, 2)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'HUCS101(P)' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 1, 1)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
    end if;
    if v_sem = 2 then
      select id into v_course_id from public.courses where code = 'BTCS102M' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 2, 3)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTCS102M(P)' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 2, 1)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTCS202M' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 2, 3)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTCS202M(P)' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 2, 1)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTEC104' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 2, 4)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTEC104(P)' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 2, 1)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTIT201M' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 2, 3)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTIT208M(P)' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 2, 1)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTMA201N' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 2, 4)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
    end if;
    if v_sem = 3 then
      select id into v_course_id from public.courses where code = 'BTCS301N' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 3, 3)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTCS306M' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 3, 3)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTCS306M(P)' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 3, 1)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTCS307M' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 3, 3)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTCS307M(P)' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 3, 1)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTCS402N' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 3, 3)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTCS402N(P)' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 3, 1)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTDSE322M' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 3, 2)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTDSE322M(P)' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 3, 1)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTIT307N(P)' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 3, 1)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'GU-SEM3' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 3, 4)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
    end if;
    if v_sem = 4 then
      select id into v_course_id from public.courses where code = 'BTCS302N' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 4, 4)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTCS302N(P)' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 4, 1)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTCS401N' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 4, 4)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTCS401N(P)' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 4, 1)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTDSE423M' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 4, 2)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTDSE423M(P)' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 4, 1)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTIT301N' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 4, 3)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTIT301N(P)' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 4, 1)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTIT410M(P)' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 4, 1)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'ML307' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 4, 3)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
    end if;
    if v_sem = 5 then
      select id into v_course_id from public.courses where code = 'BTCS501N' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 5, 4)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTCS502N' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 5, 3)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTCS502N(P)' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 5, 1)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTCS503M' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 5, 3)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTCS503M(P)' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 5, 1)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTDSE511M' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 5, 3)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTDSE511M(P)' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 5, 1)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTIT507M(P)' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 5, 1)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTIT508M(p)' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 5, 1)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'GU-SEM5' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 5, 4)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
    end if;
    if v_sem = 6 then
      select id into v_course_id from public.courses where code = 'BTCS601N' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 6, 3)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTCS601N(P)' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 6, 1)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTCS602N' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 6, 3)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTCS602N(P)' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 6, 1)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTCS603N' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 6, 3)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTCS603N(P)' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 6, 1)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTCS607N' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 6, 2)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTCS708N' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 6, 3)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTCS708N(P)' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 6, 1)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTDSE613M' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 6, 3)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
    end if;
    if v_sem = 7 then
      select id into v_course_id from public.courses where code = 'BBAI501' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 7, 3)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTCS706N' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 7, 1)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTCS710' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 7, 4)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTCS710(P)' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 7, 1)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTCS711' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 7, 3)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTCS711(P)' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 7, 1)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTCS712(P)' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 7, 1)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTDSE722' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 7, 3)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTDSE722(P)' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 7, 1)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'GU-SEM7' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 7, 4)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
    end if;
  end loop;

  -- 4. Also insert even-semester syllabus courses (Sem 2, 4, 6) for completeness
  for r_prog in select id, name from public.programs loop
    if r_prog.name ~* 'Year 1' then v_sem := 2;
    elsif r_prog.name ~* 'Year 2' then v_sem := 4;
    elsif r_prog.name ~* 'Year 3' then v_sem := 6;
    elsif r_prog.name ~* 'Year 4' then v_sem := 8;
    else v_sem := 2;
    end if;

    if v_sem = 2 then
      select id into v_course_id from public.courses where code = 'BTCS102M' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 2, 3)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTCS102M(P)' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 2, 1)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTCS202M' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 2, 3)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTCS202M(P)' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 2, 1)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTEC104' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 2, 4)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTEC104(P)' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 2, 1)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTIT201M' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 2, 3)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTIT208M(P)' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 2, 1)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTMA201N' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 2, 4)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
    end if;
    if v_sem = 4 then
      select id into v_course_id from public.courses where code = 'BTCS302N' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 4, 4)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTCS302N(P)' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 4, 1)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTCS401N' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 4, 4)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTCS401N(P)' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 4, 1)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTDSE423M' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 4, 2)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTDSE423M(P)' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 4, 1)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTIT301N' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 4, 3)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTIT301N(P)' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 4, 1)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTIT410M(P)' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 4, 1)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'ML307' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 4, 3)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
    end if;
    if v_sem = 6 then
      select id into v_course_id from public.courses where code = 'BTCS601N' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 6, 3)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTCS601N(P)' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 6, 1)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTCS602N' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 6, 3)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTCS602N(P)' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 6, 1)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTCS603N' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 6, 3)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTCS603N(P)' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 6, 1)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTCS607N' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 6, 2)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTCS708N' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 6, 3)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTCS708N(P)' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 6, 1)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
      select id into v_course_id from public.courses where code = 'BTDSE613M' limit 1;
      if v_course_id is not null then
        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)
        values (r_prog.id, v_course_id, 6, 3)
        on conflict (program_id, course_id, semester) do update
        set sessions_per_week = excluded.sessions_per_week;
      end if;
    end if;
  end loop;
end $$;
