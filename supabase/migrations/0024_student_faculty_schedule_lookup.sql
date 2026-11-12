-- Migration 0024: Allow authenticated Student Section View (anon) to search faculty
-- and view any faculty member's published weekly timetable safely via SECURITY DEFINER RPCs.

create or replace function public.get_student_faculty_list()
returns jsonb
language plpgsql
security definer
as $$
declare
  v_faculty jsonb;
begin
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', f.id,
        'name', f.name,
        'email', f.email,
        'department_name', d.name
      )
      order by f.name asc
    ),
    '[]'::jsonb
  )
  into v_faculty
  from public.faculty f
  left join public.departments d on d.id = f.department_id;

  return jsonb_build_object(
    'success', true,
    'faculty', v_faculty
  );
end;
$$;

grant execute on function public.get_student_faculty_list() to anon, authenticated, service_role;

create or replace function public.get_student_faculty_timetable(
  p_faculty_id uuid
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_faculty record;
  v_version_id uuid;
  v_entries jsonb;
  v_substitutions jsonb;
begin
  select f.id, f.name, f.email, d.name as department_name
  into v_faculty
  from public.faculty f
  left join public.departments d on d.id = f.department_id
  where f.id = p_faculty_id
  limit 1;

  if v_faculty is null then
    return jsonb_build_object(
      'success', false,
      'error', 'Faculty member not found.'
    );
  end if;

  select id into v_version_id
  from public.timetable_versions
  where status = 'published'
  order by published_at desc nulls last, created_at desc
  limit 1;

  if v_version_id is null then
    return jsonb_build_object(
      'success', true,
      'faculty', jsonb_build_object(
        'id', v_faculty.id,
        'name', v_faculty.name,
        'email', v_faculty.email,
        'department_name', v_faculty.department_name
      ),
      'has_published_timetable', false,
      'entries', '[]'::jsonb,
      'substitutions', '[]'::jsonb
    );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', te.id,
        'batch', te.batch,
        'is_elective', te.is_elective,
        'course_code', coalesce(c.code, 'GE'),
        'course_name', coalesce(c.name, 'Generic Elective'),
        'room_name', coalesce(r.name, 'Elective Room'),
        'section_name', s.name,
        'day_of_week', ts.day_of_week,
        'period', ts.period,
        'start_time', ts.starts_at::text,
        'end_time', ts.ends_at::text
      )
      order by ts.day_of_week, ts.period, te.batch nulls first
    ),
    '[]'::jsonb
  )
  into v_entries
  from public.timetable_entries te
  left join public.courses c on c.id = te.course_id
  left join public.rooms r on r.id = te.room_id
  left join public.sections s on s.id = te.section_id
  join public.time_slots ts on ts.id = te.time_slot_id
  where te.version_id = v_version_id
    and te.faculty_id = p_faculty_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', sr.id,
        'entry_id', sr.timetable_entry_id,
        'created_at', sr.created_at,
        'status', sr.status,
        'role', case when sr.assigned_faculty_id = p_faculty_id then 'covering' else 'requester' end,
        'day_of_week', ts.day_of_week,
        'period', ts.period,
        'batch', te.batch,
        'is_elective', te.is_elective,
        'course_code', coalesce(c.code, 'GE'),
        'course_name', coalesce(c.name, 'Generic Elective'),
        'room_name', coalesce(r.name, 'Elective Room'),
        'section_name', s.name,
        'substitute_name', f_sub.name,
        'requester_name', f_req.name
      )
      order by sr.created_at desc
    ),
    '[]'::jsonb
  )
  into v_substitutions
  from public.substitution_requests sr
  join public.timetable_entries te on te.id = sr.timetable_entry_id
  left join public.courses c on c.id = te.course_id
  left join public.rooms r on r.id = te.room_id
  left join public.sections s on s.id = te.section_id
  join public.time_slots ts on ts.id = te.time_slot_id
  join public.faculty f_req on f_req.id = sr.requester_faculty_id
  left join public.faculty f_sub on f_sub.id = sr.assigned_faculty_id
  where te.version_id = v_version_id
    and (sr.requester_faculty_id = p_faculty_id or (sr.assigned_faculty_id = p_faculty_id and sr.status = 'assigned'))
    and sr.status in ('open', 'assigned', 'expired', 'unfilled')
    and sr.created_at >= now() - interval '2 days';

  return jsonb_build_object(
    'success', true,
    'faculty', jsonb_build_object(
      'id', v_faculty.id,
      'name', v_faculty.name,
      'email', v_faculty.email,
      'department_name', v_faculty.department_name
    ),
    'has_published_timetable', true,
    'entries', v_entries,
    'substitutions', v_substitutions
  );
end;
$$;

grant execute on function public.get_student_faculty_timetable(uuid) to anon, authenticated, service_role;

