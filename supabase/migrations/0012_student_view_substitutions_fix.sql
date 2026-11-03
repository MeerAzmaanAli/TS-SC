-- Migration 0012: Ensure all active substitution requests are included in student view
-- Fixes:
-- 1. When testing with BYPASS_DAY_OF_POLICY = true (or forward scheduling), requests might have been created
--    for any lecture slot across the week (not strictly where sr.created_at::date = current_date).
-- 2. Only showing requests with sr.created_at::date = current_date caused substitutions for sessions on other days
--    or created on preceding days to either disappear or be matched incorrectly.
-- 3. Returns all active/recent substitutions for the section so students always see accurate slot highlighting.

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

  -- 4. Fetch substitution requests for this section
  -- Matches both today's requests and any currently open/assigned requests for this section's timetable
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
      ) order by ts.day_of_week, ts.period
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
    and (
      sr.created_at::date = current_date
      or sr.status in ('open', 'assigned')
    );

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

grant execute on function public.get_section_timetable(text, text) to anon, authenticated, service_role;

