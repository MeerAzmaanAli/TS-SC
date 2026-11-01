-- Migration 0006: Fix mutual recursion between substitution_requests and substitution_candidates
--
-- The issue:
-- 1. substitution_requests policy checks substitution_candidates.
-- 2. substitution_candidates policy checks substitution_requests.
-- In PostgreSQL RLS, mutually referential subqueries trigger "infinite recursion detected in policy".
--
-- The fix:
-- Use a SECURITY DEFINER helper function to check whether a request was created by the caller,
-- which bypasses RLS on substitution_requests during the check and breaks the recursion cycle.

create or replace function public.is_request_owner(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.substitution_requests
    where id = p_request_id
      and requester_faculty_id = public.my_faculty_id()
  );
$$;

-- Drop previous policies if they were applied
drop policy if exists "faculty_insert_candidates_for_own_request" on public.substitution_candidates;
drop policy if exists "faculty_read_candidates_for_own_request" on public.substitution_candidates;

-- Add safe policies on substitution_candidates using the SECURITY DEFINER function
create policy "faculty_insert_candidates_for_own_request" on public.substitution_candidates
  for insert with check (public.is_request_owner(request_id));

create policy "faculty_read_candidates_for_own_request" on public.substitution_candidates
  for select using (public.is_request_owner(request_id));
