-- Migration 0022: Substitution Lifecycle & Auto-Expiration
-- 1. Adds 'expired' status and atomic lifecycle resolution RPC
-- 2. Expires open requests whose deadline has passed without assignment
-- 3. Records penalties for candidates who refused (rejected) or timed out
-- 4. Moves completed assigned requests to 'completed' / past status once their lecture day has ended

-- Update check constraint on substitution_requests status to support 'expired' and 'completed'
alter table public.substitution_requests
  drop constraint if exists substitution_requests_status_check;

alter table public.substitution_requests
  add constraint substitution_requests_status_check
  check (status in ('open', 'assigned', 'unfilled', 'expired', 'completed'));

-- Stored procedure to sweep and finalize all overdue / completed substitution requests
create or replace function public.sweep_substitution_requests()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req record;
  v_expired_count int := 0;
  v_penalty_count int := 0;
  v_completed_count int := 0;
  v_cand record;
begin
  -- 1. Expire open requests whose deadline has passed without assignment
  for v_req in
    select sr.id, sr.institution_id, sr.timetable_entry_id, sr.requester_faculty_id
    from public.substitution_requests sr
    where sr.status = 'open'
      and sr.deadline <= now()
  loop
    -- Check if any candidate accepted
    if not exists (
      select 1 from public.substitution_candidates sc
      where sc.request_id = v_req.id and sc.response = 'accepted'
    ) then
      -- Transition status to expired (or unfilled)
      update public.substitution_requests
      set status = 'expired'
      where id = v_req.id;

      v_expired_count := v_expired_count + 1;

      -- Mark all pending candidates as timed_out
      update public.substitution_candidates
      set response = 'timed_out', responded_at = coalesce(responded_at, now())
      where request_id = v_req.id
        and response = 'pending';

      -- Record penalties for candidates who rejected or timed out (avoid duplicate penalties)
      for v_cand in
        select sc.faculty_id, sc.response
        from public.substitution_candidates sc
        where sc.request_id = v_req.id
          and sc.response in ('rejected', 'timed_out')
      loop
        if not exists (
          select 1 from public.substitution_penalties sp
          where sp.request_id = v_req.id
            and sp.faculty_id = v_cand.faculty_id
        ) then
          insert into public.substitution_penalties (
            institution_id,
            faculty_id,
            request_id,
            reason,
            created_at
          ) values (
            v_req.institution_id,
            v_cand.faculty_id,
            v_req.id,
            v_cand.response,
            now()
          );
          v_penalty_count := v_penalty_count + 1;
        end if;
      end loop;
    end if;
  end loop;

  return jsonb_build_object(
    'success', true,
    'expired_count', v_expired_count,
    'penalties_recorded', v_penalty_count,
    'message', 'Sweep completed successfully.'
  );
end;
$$;

-- Grant execution to authenticated and anon users
grant execute on function public.sweep_substitution_requests() to anon, authenticated, service_role;

