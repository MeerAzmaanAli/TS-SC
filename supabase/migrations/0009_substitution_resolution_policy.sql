-- Migration 0009: Allow substitution resolution by candidates and provide atomic resolution RPC

-- 1. Create a secure RPC to resolve substitution requests atomically
create or replace function public.resolve_substitution_request(
  p_request_id uuid,
  p_winner_faculty_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req record;
begin
  select id, status, timetable_entry_id, requester_faculty_id
  into v_req
  from public.substitution_requests
  where id = p_request_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Substitution request not found.');
  end if;

  if v_req.status != 'open' then
    return jsonb_build_object('success', true, 'message', 'Request already finalized.', 'status', v_req.status);
  end if;

  -- Verify winner exists in faculty table
  if not exists (select 1 from public.faculty where id = p_winner_faculty_id) then
    return jsonb_build_object('success', false, 'error', 'Invalid winner faculty ID.');
  end if;

  -- Atomically update substitution_requests
  update public.substitution_requests
  set status = 'assigned',
      assigned_faculty_id = p_winner_faculty_id
  where id = p_request_id;

  return jsonb_build_object(
    'success', true,
    'status', 'assigned',
    'assigned_faculty_id', p_winner_faculty_id
  );
end;
$$;

grant execute on function public.resolve_substitution_request(uuid, uuid) to anon, authenticated, service_role;

-- 2. Update RLS policy so candidates can also update the request if needed
drop policy if exists "faculty_update_own" on public.substitution_requests;

create policy "faculty_update_involved" on public.substitution_requests
  for update
  using (
    requester_faculty_id = public.my_faculty_id()
    or exists (
      select 1 from public.substitution_candidates c
      where c.request_id = substitution_requests.id
        and c.faculty_id = public.my_faculty_id()
    )
  )
  with check (
    requester_faculty_id = public.my_faculty_id()
    or exists (
      select 1 from public.substitution_candidates c
      where c.request_id = substitution_requests.id
        and c.faculty_id = public.my_faculty_id()
    )
  );

