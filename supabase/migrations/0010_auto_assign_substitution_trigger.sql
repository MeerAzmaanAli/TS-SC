-- Migration 0010: Database Trigger to Auto-Assign Substitute on Acceptance & Resolve Existing Requests

-- 1. Immediately resolve any currently open request that already has an accepted candidate
update public.substitution_requests sr
set status = 'assigned',
    assigned_faculty_id = sc.faculty_id
from public.substitution_candidates sc
where sc.request_id = sr.id
  and sc.response = 'accepted'
  and sr.status = 'open';

-- 2. Create trigger function to immediately assign substitute whenever a candidate accepts
create or replace function public.trig_assign_substitution_on_accept()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.response = 'accepted' then
    -- Atomically assign winner and close request to other candidates
    update public.substitution_requests
    set status = 'assigned',
        assigned_faculty_id = new.faculty_id
    where id = new.request_id
      and status = 'open';
  end if;
  return new;
end;
$$;

-- 3. Attach trigger to substitution_candidates
drop trigger if exists tr_assign_sub_on_accept on public.substitution_candidates;

create trigger tr_assign_sub_on_accept
after update of response or insert on public.substitution_candidates
for each row
when (new.response = 'accepted')
execute function public.trig_assign_substitution_on_accept();

-- 4. Allow all faculty to read published timetable entries (needed for schedule inspection and workload calculations)
drop policy if exists "faculty_own_published" on public.timetable_entries;
drop policy if exists "faculty_view_all_published" on public.timetable_entries;

create policy "faculty_view_all_published" on public.timetable_entries
  for select using (
    exists (
      select 1 from public.timetable_versions v
      where v.id = timetable_entries.version_id and v.status = 'published'
    )
  );

-- 5. Ensure faculty can read requests they requested, are assigned to, or were invited as candidates
drop policy if exists "faculty_read_involved" on public.substitution_requests;

create policy "faculty_read_involved" on public.substitution_requests
  for select using (
    requester_faculty_id = public.my_faculty_id()
    or assigned_faculty_id = public.my_faculty_id()
    or exists (
      select 1 from public.substitution_candidates c
      where c.request_id = substitution_requests.id
        and c.faculty_id = public.my_faculty_id()
    )
  );
