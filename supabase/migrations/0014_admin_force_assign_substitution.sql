-- Migration 0014: Admin force assign substitution request
-- Allows admin or users with appropriate rights to assign/reassign any faculty member as substitute

create or replace function public.admin_force_assign_substitution(
  p_request_id uuid,
  p_faculty_id uuid,
  p_admin_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req record;
  v_fac record;
begin
  -- 1. Verify substitution request exists
  select id, status, timetable_entry_id, requester_faculty_id, reason
  into v_req
  from public.substitution_requests
  where id = p_request_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Substitution request not found.');
  end if;

  -- 2. Verify faculty exists
  select id, name, email
  into v_fac
  from public.faculty
  where id = p_faculty_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Faculty member not found.');
  end if;

  -- 3. Cannot assign the requester to substitute their own lecture
  if v_req.requester_faculty_id = p_faculty_id then
    return jsonb_build_object('success', false, 'error', 'Cannot assign the requesting teacher to cover their own class.');
  end if;

  -- 4. Force assign: update status and assigned_faculty_id
  update public.substitution_requests
  set status = 'assigned',
      assigned_faculty_id = p_faculty_id,
      reason = coalesce(p_admin_notes, reason)
  where id = p_request_id;

  -- 5. If this faculty is already in substitution_candidates, update their response to 'accepted'
  if exists (select 1 from public.substitution_candidates where request_id = p_request_id and faculty_id = p_faculty_id) then
    update public.substitution_candidates
    set response = 'accepted',
        responded_at = now()
    where request_id = p_request_id and faculty_id = p_faculty_id;
  else
    -- Otherwise, insert a candidate entry marking them as admin-assigned (priority 1)
    insert into public.substitution_candidates (request_id, faculty_id, priority, response, responded_at)
    values (p_request_id, p_faculty_id, 1, 'accepted', now())
    on conflict do nothing;
  end if;

  return jsonb_build_object(
    'success', true,
    'status', 'assigned',
    'assigned_faculty_id', p_faculty_id,
    'assigned_faculty_name', v_fac.name
  );
end;
$$;

grant execute on function public.admin_force_assign_substitution(uuid, uuid, text) to anon, authenticated, service_role;

