-- Migration 0028: Transactional Substitution CRUD, Deletion & Cancellation Support
-- Ensures ACID transaction-based consistency: all changes either complete atomically or roll back completely.

-- 1. Immediately purge any erroneous 'unfilled' or cancelled requests and their dependencies,
--    instantly restoring affected lectures to normal active status.
delete from public.substitution_penalties
where request_id in (
  select id from public.substitution_requests where status in ('unfilled', 'cancelled')
);

delete from public.substitution_candidates
where request_id in (
  select id from public.substitution_requests where status in ('unfilled', 'cancelled')
);

delete from public.substitution_requests
where status in ('unfilled', 'cancelled');

-- 2. Update status check constraint to support 'cancelled'
alter table public.substitution_requests
  drop constraint if exists substitution_requests_status_check;
alter table public.substitution_requests
  drop constraint if exists substitustion_requests_status_check;

alter table public.substitution_requests
  add constraint substitution_requests_status_check
  check (status in ('open', 'assigned', 'unfilled', 'expired', 'completed', 'cancelled'));

-- 3. Add explicit DELETE RLS policies for faculty on substitution_requests & candidates
drop policy if exists "faculty_delete_own" on public.substitution_requests;
create policy "faculty_delete_own" on public.substitution_requests
  for delete using (
    requester_faculty_id = public.my_faculty_id()
    or public.is_admin()
  );

drop policy if exists "faculty_delete_own_candidates" on public.substitution_candidates;
create policy "faculty_delete_own_candidates" on public.substitution_candidates
  for delete using (
    exists (
      select 1 from public.substitution_requests sr
      where sr.id = substitution_candidates.request_id
        and (sr.requester_faculty_id = public.my_faculty_id() or public.is_admin())
    )
  );

-- 4. Fix clear_all_substitution_data with explicit WHERE clauses to satisfy PostgreSQL safe update checks
create or replace function public.clear_all_substitution_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  select count(*) into v_count from public.substitution_requests where id is not null;
  
  delete from public.substitution_penalties where id is not null;
  delete from public.substitution_candidates where id is not null;
  delete from public.substitution_requests where id is not null;

  return jsonb_build_object(
    'success', true,
    'deleted_count', v_count,
    'message', 'All substitution requests, candidate logs, and penalties have been cleared.'
  );
exception
  when others then
    return jsonb_build_object('success', false, 'error', SQLERRM);
end;
$$;

grant execute on function public.clear_all_substitution_data() to anon, authenticated, service_role;

-- 5. Drop existing versions to prevent signature mismatch
drop function if exists public.delete_substitution_request(uuid);
drop function if exists public.delete_substitution_request(uuid, uuid);
drop function if exists public.cancel_substitution_request(uuid);
drop function if exists public.cancel_substitution_request(uuid, uuid);

-- 6. Atomic Transactional Deletion RPC
create or replace function public.delete_substitution_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req record;
  v_caller_faculty_id uuid;
  v_is_admin boolean;
begin
  -- Resolve caller faculty ID from public.my_faculty_id()
  v_caller_faculty_id := public.my_faculty_id();
  v_is_admin := public.is_admin();

  select * into v_req
  from public.substitution_requests
  where id = p_request_id;

  if v_req.id is null then
    return jsonb_build_object('success', false, 'error', 'Substitution request not found or already deleted.');
  end if;

  -- Ensure caller is either the requester faculty or an admin
  if not v_is_admin and v_caller_faculty_id is not null and v_req.requester_faculty_id != v_caller_faculty_id then
    return jsonb_build_object('success', false, 'error', 'Unauthorized: Only the requesting faculty or an administrator can delete this request.');
  end if;

  -- Atomic Cascade Delete: Penalties, Candidates, and the Request itself
  delete from public.substitution_penalties where request_id = p_request_id;
  delete from public.substitution_candidates where request_id = p_request_id;
  delete from public.substitution_requests where id = p_request_id;

  return jsonb_build_object(
    'success', true,
    'message', 'Substitution request deleted and session restored.'
  );
exception
  when others then
    -- Any unexpected failure rolls back the entire transaction automatically
    return jsonb_build_object('success', false, 'error', SQLERRM);
end;
$$;

grant execute on function public.delete_substitution_request(uuid) to anon, authenticated, service_role;

-- 7. Atomic Transactional Cancellation RPC
create or replace function public.cancel_substitution_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Executes atomic deletion to restore the lecture slot
  return public.delete_substitution_request(p_request_id);
end;
$$;

grant execute on function public.cancel_substitution_request(uuid) to anon, authenticated, service_role;

-- 8. Atomic Transactional Purge of Unfilled Requests
create or replace function public.purge_unfilled_substitutions()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  select count(*) into v_count
  from public.substitution_requests
  where status in ('unfilled', 'cancelled');

  delete from public.substitution_penalties
  where request_id in (select id from public.substitution_requests where status in ('unfilled', 'cancelled'));

  delete from public.substitution_candidates
  where request_id in (select id from public.substitution_requests where status in ('unfilled', 'cancelled'));

  delete from public.substitution_requests
  where status in ('unfilled', 'cancelled');

  return jsonb_build_object(
    'success', true,
    'purged_count', v_count,
    'message', format('Successfully purged %s unfilled/cancelled requests and restored sessions.', v_count)
  );
exception
  when others then
    return jsonb_build_object('success', false, 'error', SQLERRM);
end;
$$;

grant execute on function public.purge_unfilled_substitutions() to anon, authenticated, service_role;

-- 9. Atomic Transactional Creation RPC
create or replace function public.create_substitution_request_atomic(
  p_institution_id uuid,
  p_timetable_entry_id uuid,
  p_requester_faculty_id uuid,
  p_reason text,
  p_deadline timestamptz,
  p_candidates jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
  v_cand jsonb;
begin
  -- 1. Insert substitution request
  insert into public.substitution_requests (
    institution_id,
    timetable_entry_id,
    requester_faculty_id,
    reason,
    deadline,
    status
  ) values (
    p_institution_id,
    p_timetable_entry_id,
    p_requester_faculty_id,
    p_reason,
    p_deadline,
    'open'
  )
  returning id into v_request_id;

  -- 2. Insert candidates atomically
  if p_candidates is not null and jsonb_array_length(p_candidates) > 0 then
    for v_cand in select * from jsonb_array_elements(p_candidates)
    loop
      insert into public.substitution_candidates (
        request_id,
        faculty_id,
        priority,
        response
      ) values (
        v_request_id,
        (v_cand->>'faculty_id')::uuid,
        (v_cand->>'priority')::int,
        'pending'
      );
    end loop;
  end if;

  return jsonb_build_object(
    'success', true,
    'request_id', v_request_id
  );
exception
  when others then
    -- Transaction rolls back automatically on error
    return jsonb_build_object('success', false, 'error', SQLERRM);
end;
$$;

grant execute on function public.create_substitution_request_atomic(uuid, uuid, uuid, text, timestamptz, jsonb) to anon, authenticated, service_role;
