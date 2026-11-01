-- Migration 0007: Section Passkeys & Public Section Timetable RPC
-- Allows students to access their section's timetable & live substitutions
-- using a (section_code, passkey) pair without requiring user accounts or storing student data.

-- 1. Add section code and passkey columns to sections table
alter table if exists public.sections
  add column if not exists code text unique,
  add column if not exists passkey text not null default substring(md5(random()::text), 1, 6);

-- 2. Backfill existing sections with standard codes (e.g., BTCS27A ... BTCS27J) and clean passkeys
do $$
declare
  r record;
  sec_letter text;
  idx int := 1;
  pass_num int;
begin
  for r in select id, name from public.sections order by name asc loop
    -- Extract last character or letter (e.g. from 'CSE-A' -> 'A')
    sec_letter := right(r.name, 1);
    pass_num := 1000 + floor(random() * 8999)::int;
    
    update public.sections
    set 
      code = coalesce(code, 'BTCS27' || sec_letter),
      passkey = coalesce(nullif(passkey, ''), sec_letter || '-' || pass_num::text)
    where id = r.id;
    
    idx := idx + 1;
  end loop;
end $$;

-- 3. Create index for fast code lookup
create index if not exists sections_code_idx on public.sections (upper(code));

-- 4. Create an RPC function to verify passkey and return the complete timetable + today's substitutions
create or replace function public.get_section_timetable(
  p_code text,
  p_passkey text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_section record;
  v_version_id uuid;
  v_today_dow int;
  v_entries jsonb;
  v_substitutions jsonb;
begin
  -- 1. Find section matching code (case-insensitive) and passkey
  select s.id, s.name, s.code, s.semester, s.strength, s.batch_count, p.name as program_name
  into v_section
  from public.sections s
  join public.programs p on p.id = s.program_id
  where upper(trim(s.code)) = upper(trim(p_code))
    and trim(s.passkey) = trim(p_passkey);

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'Invalid section code or passkey. Please check with your Class Coordinator.'
    );
  end if;

  -- 2. Find latest published timetable version
  select id into v_version_id
  from public.timetable_versions
  where status = 'published'
  order by published_at desc
  limit 1;

  if v_version_id is null then
    return jsonb_build_object(
      'success', true,
      'section', jsonb_build_object(
        'id', v_section.id,
        'name', v_section.name,
        'code', v_section.code,
        'semester', v_section.semester,
        'strength', v_section.strength,
        'batch_count', v_section.batch_count,
        'program_name', v_section.program_name
      ),
      'has_published_timetable', false,
      'entries', '[]'::jsonb,
      'today_substitutions', '[]'::jsonb
    );
  end if;

  -- 3. Fetch timetable entries for this section
  -- Table columns:
  --   timetable_entries: time_slot_id, course_id, room_id, faculty_id, section_id, version_id, batch, is_elective
  --   time_slots: day_of_week, period, starts_at, ends_at
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', te.id,
        'batch', te.batch,
        'is_elective', te.is_elective,
        'course_code', c.code,
        'course_name', c.name,
        'room_name', r.name,
        'room_type', r.room_type,
        'faculty_name', f.name,
        'faculty_id', f.id,
        'day_of_week', ts.day_of_week,
        'period', ts.period,
        'start_time', ts.starts_at::text,
        'end_time', ts.ends_at::text
      ) order by ts.day_of_week, ts.period, te.batch nulls first
    ),
    '[]'::jsonb
  )
  into v_entries
  from public.timetable_entries te
  join public.courses c on c.id = te.course_id
  join public.rooms r on r.id = te.room_id
  join public.faculty f on f.id = te.faculty_id
  join public.time_slots ts on ts.id = te.time_slot_id
  where te.version_id = v_version_id
    and te.section_id = v_section.id;

  -- 4. Fetch today's substitution requests for this section
  -- Table columns:
  --   substitution_requests: timetable_entry_id, requester_faculty_id, assigned_faculty_id, status, deadline, created_at
  v_today_dow := extract(isodow from current_date)::int;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', sr.id,
        'entry_id', sr.timetable_entry_id,
        'date', (sr.created_at::date)::text,
        'status', sr.status,
        'period', ts.period,
        'day_of_week', ts.day_of_week,
        'start_time', ts.starts_at::text,
        'end_time', ts.ends_at::text,
        'course_name', c.name,
        'course_code', c.code,
        'requester_name', orig_f.name,
        'substitute_name', sub_f.name,
        'deadline', sr.deadline
      ) order by ts.period
    ),
    '[]'::jsonb
  )
  into v_substitutions
  from public.substitution_requests sr
  join public.timetable_entries te on te.id = sr.timetable_entry_id
  join public.time_slots ts on ts.id = te.time_slot_id
  join public.courses c on c.id = te.course_id
  join public.faculty orig_f on orig_f.id = sr.requester_faculty_id
  left join public.faculty sub_f on sub_f.id = sr.assigned_faculty_id
  where te.section_id = v_section.id
    and sr.created_at::date = current_date;

  return jsonb_build_object(
    'success', true,
    'section', jsonb_build_object(
      'id', v_section.id,
      'name', v_section.name,
      'code', v_section.code,
      'semester', v_section.semester,
      'strength', v_section.strength,
      'batch_count', v_section.batch_count,
      'program_name', v_section.program_name
    ),
    'has_published_timetable', true,
    'entries', v_entries,
    'today_substitutions', v_substitutions
  );
end;
$$;

-- Grant execute permissions to anon and authenticated roles
grant execute on function public.get_section_timetable(text, text) to anon, authenticated, service_role;
