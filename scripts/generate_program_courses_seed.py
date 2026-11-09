import os
import csv
from collections import defaultdict

def main():
    courses_csv = os.path.join("data", "institutional", "courses.csv")
    out_sql = os.path.join("supabase", "seed_program_courses.sql")

    courses = []
    with open(courses_csv, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            courses.append({
                "code": r["code"],
                "name": r["name"],
                "semester": int(r["semester"]),
                "sessions_per_week": int(r["sessions_per_week"]),
            })

    # Group courses by semester
    courses_by_sem = defaultdict(list)
    for c in courses:
        courses_by_sem[c["semester"]].append(c)

    lines = []
    lines.append("-- Seed program_courses and update courses.semester based on data/institutional/courses.csv")
    lines.append("do $$")
    lines.append("declare")
    lines.append("  r_prog record;")
    lines.append("  v_course_id uuid;")
    lines.append("  v_sem int;")
    lines.append("begin")
    lines.append("  -- 1. Update courses table with their respective semester from courses.csv")
    for c in courses:
        lines.append(f"  update public.courses set semester = {c['semester']} where code = '{c['code']}';")

    lines.append("")
    lines.append("  -- 2. Clear existing program_courses to avoid duplicates")
    lines.append("  delete from public.program_courses;")
    lines.append("")
    lines.append("  -- 3. Insert syllabus scheme (program_courses) for each program matching its active semesters")
    lines.append("  for r_prog in select id, name from public.programs loop")
    lines.append("    -- Determine default semester from program name")
    lines.append("    if r_prog.name ~* 'Year 1' then v_sem := 1;")
    lines.append("    elsif r_prog.name ~* 'Year 2' then v_sem := 3;")
    lines.append("    elsif r_prog.name ~* 'Year 3' then v_sem := 5;")
    lines.append("    elsif r_prog.name ~* 'Year 4' then v_sem := 7;")
    lines.append("    else v_sem := 1;")
    lines.append("    end if;")
    lines.append("")
    lines.append("    -- Insert primary semester syllabus courses for this program")
    for sem, c_list in sorted(courses_by_sem.items()):
        lines.append(f"    if v_sem = {sem} then")
        for c in c_list:
            lines.append(f"      select id into v_course_id from public.courses where code = '{c['code']}' limit 1;")
            lines.append(f"      if v_course_id is not null then")
            lines.append(f"        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)")
            lines.append(f"        values (r_prog.id, v_course_id, {sem}, {c['sessions_per_week']})")
            lines.append(f"        on conflict (program_id, course_id, semester) do update")
            lines.append(f"        set sessions_per_week = excluded.sessions_per_week;")
            lines.append(f"      end if;")
        lines.append(f"    end if;")
    lines.append("  end loop;")
    lines.append("")
    lines.append("  -- 4. Also insert even-semester syllabus courses (Sem 2, 4, 6) for completeness")
    lines.append("  for r_prog in select id, name from public.programs loop")
    lines.append("    if r_prog.name ~* 'Year 1' then v_sem := 2;")
    lines.append("    elsif r_prog.name ~* 'Year 2' then v_sem := 4;")
    lines.append("    elsif r_prog.name ~* 'Year 3' then v_sem := 6;")
    lines.append("    elsif r_prog.name ~* 'Year 4' then v_sem := 8;")
    lines.append("    else v_sem := 2;")
    lines.append("    end if;")
    lines.append("")
    for sem in [2, 4, 6]:
        if sem in courses_by_sem:
            lines.append(f"    if v_sem = {sem} then")
            for c in courses_by_sem[sem]:
                lines.append(f"      select id into v_course_id from public.courses where code = '{c['code']}' limit 1;")
                lines.append(f"      if v_course_id is not null then")
                lines.append(f"        insert into public.program_courses (program_id, course_id, semester, sessions_per_week)")
                lines.append(f"        values (r_prog.id, v_course_id, {sem}, {c['sessions_per_week']})")
                lines.append(f"        on conflict (program_id, course_id, semester) do update")
                lines.append(f"        set sessions_per_week = excluded.sessions_per_week;")
                lines.append(f"      end if;")
            lines.append(f"    end if;")
    lines.append("  end loop;")
    lines.append("end $$;")
    lines.append("")

    with open(out_sql, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print(f"Generated {out_sql} with {len(lines)} lines")

if __name__ == "__main__":
    main()

