-- Migration 0023: Return created_at/course metadata in get_section_timetable
-- and exclude stale historical substitution requests (> 2 days old) at the DB level.

create or replace function public.get_section_timetable(
  p_code text,
  p_passkey text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_section record;
  v_version_id uuid;
  v_entries jsonb;
  v_substitutions jsonb;
begin
  -- 1. Authenticate section by code (case-insensitive) + passkey
  select s.id, s.name, s.code, s.semester, s.strength, s.batch_count, s.shift, p.name as program_name, d.name as department_name
  into v_section
  from public.sections s
  join public.programs p on p.id = s.program_id
  left join public.departments d on d.id = p.department_id
  where upper(s.code) = upper(trim(p_code))
    and s.passkey = trim(p_passkey)
  limit 1;

  if v_section is null then
    return jsonb_build_object(
      'success', false,
      'error', 'Invalid Section Code or Passkey. Please verify with your Class Coordinator.'
    );
  end if;

  -- 2. Find latest published timetable version
  select id into v_version_id
  from public.timetable_versions
  where status = 'published'
  order by published_at desc nulls last, created_at desc
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
        'shift', v_section.shift,
        'program_name', v_section.program_name,
        'department_name', v_section.department_name
      ),
      'has_published_timetable', false,
      'entries', '[]'::jsonb,
      'today_substitutions', '[]'::jsonb
    );
  end if;

  -- 3. Fetch timetable entries using LEFT JOIN for rooms/faculty/courses so generic electives never drop
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', te.id,
        'batch', te.batch,
        'is_elective', te.is_elective,
        'course_code', coalesce(c.code, 'GE'),
        'course_name', coalesce(c.name, 'Generic Elective'),
        'room_name', coalesce(r.name, 'Elective Room'),
        'room_type', coalesce(r.room_type, 'classroom'),
        'faculty_name', coalesce(f.name, 'Multiple Faculty'),
        'faculty_id', te.faculty_id,
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
  left join public.courses c on c.id = te.course_id
  left join public.rooms r on r.id = te.room_id
  left join public.faculty f on f.id = te.faculty_id
  join public.time_slots ts on ts.id = te.time_slot_id
  where te.version_id = v_version_id
    and te.section_id = v_section.id;

  -- 4. Fetch recent/active substitution requests for this section (client filters exact day rollover by local time)
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', sr.id,
        'entry_id', sr.timetable_entry_id,
        'date', sr.created_at::date,
        'created_at', sr.created_at,
        'deadline', sr.deadline,
        'status', sr.status,
        'period', ts.period,
        'day_of_week', ts.day_of_week,
        'start_time', ts.starts_at::text,
        'end_time', ts.ends_at::text,
        'course_code', coalesce(c.code, 'GE'),
        'course_name', coalesce(c.name, 'Generic Elective'),
        'substitute_name', f_sub.name,
        'requester_name', f_req.name
      )
      order by ts.period asc
    ),
    '[]'::jsonb
  )
  into v_substitutions
  from public.substitution_requests sr
  join public.timetable_entries te on te.id = sr.timetable_entry_id
  left join public.courses c on c.id = te.course_id
  join public.time_slots ts on ts.id = te.time_slot_id
  join public.faculty f_req on f_req.id = sr.requester_faculty_id
  left join public.faculty f_sub on f_sub.id = sr.assigned_faculty_id
  where te.version_id = v_version_id
    and te.section_id = v_section.id
    and sr.status in ('open', 'assigned', 'expired', 'unfilled')
    and sr.created_at >= now() - interval '2 days';

  return jsonb_build_object(
    'success', true,
    'section', jsonb_build_object(
      'id', v_section.id,
      'name', v_section.name,
      'code', v_section.code,
      'semester', v_section.semester,
      'strength', v_section.strength,
      'batch_count', v_section.batch_count,
      'shift', v_section.shift,
      'program_name', v_section.program_name
    ),
    'has_published_timetable', true,
    'entries', v_entries,
    'today_substitutions', v_substitutions
  );
end;
$$;

grant execute on function public.get_section_timetable(text, text) to anon, authenticated, service_role;

