-- Migration 0025: Lightweight Section Passkey Verification RPC
-- Replaces the full get_section_timetable call on Login with a cheap credential check.
-- get_section_timetable continues to be used by StudentView for the actual timetable fetch.

create or replace function public.verify_section_passkey(
  p_code    text,
  p_passkey text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_section record;
begin
  -- Single row lookup — no timetable joins, no substitution aggregates
  select
    s.id,
    s.name,
    s.code,
    s.semester,
    s.shift,
    p.name  as program_name,
    d.name  as department_name
  into v_section
  from public.sections s
  join public.programs    p on p.id = s.program_id
  join public.departments d on d.id = p.department_id
  where upper(trim(s.code)) = upper(trim(p_code))
    and trim(s.passkey)     = trim(p_passkey)
  limit 1;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error',   'Invalid Section Code or Passkey. Please verify with your Class Coordinator.'
    );
  end if;

  return jsonb_build_object(
    'success',         true,
    'section_id',      v_section.id,
    'section_name',    v_section.name,
    'section_code',    v_section.code,
    'semester',        v_section.semester,
    'shift',           v_section.shift,
    'program_name',    v_section.program_name,
    'department_name', v_section.department_name
  );
end;
$$;

grant execute on function public.verify_section_passkey(text, text)
  to anon, authenticated, service_role;

