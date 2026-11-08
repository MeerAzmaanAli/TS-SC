-- Migration 0018: Use LEFT JOIN in get_section_timetable for rooms and faculty
-- Ensures Generic Elective (GE) slots (which have nullable room_id and faculty_id)
-- are not dropped from student view on Thursday & Friday.

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
  select s.id, s.name, s.code, s.semester, s.strength, s.batch_count, s.shift, p.name as program_name
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
        'shift', v_section.shift,
        'program_name', v_section.program_name
      ),
      'has_published_timetable', false,
      'entries', '[]'::jsonb,
      'today_substitutions', '[]'::jsonb
    );
  end if;

  -- 3. Fetch timetable entries for this section (LEFT JOIN on rooms and faculty so GE entries are preserved)
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', te.id,
        'batch', te.batch,
        'is_elective', te.is_elective,
        'course_code', coalesce(c.code, 'GE'),
        'course_name', coalesce(c.name, 'Generic Elective (Institute Basket)'),
        'room_name', coalesce(r.name, 'Elective Allocation'),
        'room_type', coalesce(r.room_type, 'classroom'),
        'faculty_name', coalesce(f.name, 'Elective Faculty'),
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
  left join public.courses c on c.id = te.course_id
  left join public.rooms r on r.id = te.room_id
  left join public.faculty f on f.id = te.faculty_id
  join public.time_slots ts on ts.id = te.time_slot_id
  where te.version_id = v_version_id
    and te.section_id = v_section.id;

  -- 4. Fetch substitution requests for this section
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', sr.id,
        'entry_id', sr.timetable_entry_id,
        'date', sr.created_at::date,
        'status', sr.status,
        'period', ts.period,
        'day_of_week', ts.day_of_week,
        'substitute_name', f_sub.name,
        'requester_name', f_req.name
      )
    ),
    '[]'::jsonb
  )
  into v_substitutions
  from public.substitution_requests sr
  join public.timetable_entries te on te.id = sr.timetable_entry_id
  join public.time_slots ts on ts.id = te.time_slot_id
  join public.faculty f_req on f_req.id = sr.requester_faculty_id
  left join public.faculty f_sub on f_sub.id = sr.assigned_faculty_id
  where te.version_id = v_version_id
    and te.section_id = v_section.id
    and sr.status in ('open', 'assigned');

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

