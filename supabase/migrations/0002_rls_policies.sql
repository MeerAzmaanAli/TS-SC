-- TS-SC RLS policies (Phase 1)
--
-- Security model (see docs/ARCHITECTURE.md §7):
--   admin   — full read/write on everything
--   faculty — read reference data; read own published timetable entries;
--             manage own substitution requests and candidate responses;
--             read own penalties
--   student — read reference data; read own section's published timetable;
--             read/update own notifications and device tokens
--
-- RLS is the authorization backstop: even direct API calls cannot escape
-- these policies. service_role bypasses RLS and is used only server-side.

create extension if not exists "pgcrypto";

-- ---------- helper functions ----------
-- SECURITY DEFINER so they read profiles without recursing into its RLS.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.my_faculty_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select faculty_id from public.profiles where user_id = auth.uid();
$$;

create or replace function public.my_section_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select section_id from public.profiles where user_id = auth.uid();
$$;

-- ---------- grants ----------
-- RLS policies below are the enforcement layer; grants only open the door.

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

-- ---------- reference data: admin writes, authenticated users read ----------

create policy "admin_all" on public.institutions
  for all using (public.is_admin()) with check (public.is_admin());
create policy "authenticated_read" on public.institutions
  for select using (auth.uid() is not null);

create policy "admin_all" on public.departments
  for all using (public.is_admin()) with check (public.is_admin());
create policy "authenticated_read" on public.departments
  for select using (auth.uid() is not null);

create policy "admin_all" on public.programs
  for all using (public.is_admin()) with check (public.is_admin());
create policy "authenticated_read" on public.programs
  for select using (auth.uid() is not null);

create policy "admin_all" on public.sections
  for all using (public.is_admin()) with check (public.is_admin());
create policy "authenticated_read" on public.sections
  for select using (auth.uid() is not null);

create policy "admin_all" on public.rooms
  for all using (public.is_admin()) with check (public.is_admin());
create policy "authenticated_read" on public.rooms
  for select using (auth.uid() is not null);

create policy "admin_all" on public.courses
  for all using (public.is_admin()) with check (public.is_admin());
create policy "authenticated_read" on public.courses
  for select using (auth.uid() is not null);

create policy "admin_all" on public.faculty
  for all using (public.is_admin()) with check (public.is_admin());
create policy "authenticated_read" on public.faculty
  for select using (auth.uid() is not null);

create policy "admin_all" on public.faculty_qualifications
  for all using (public.is_admin()) with check (public.is_admin());
create policy "authenticated_read" on public.faculty_qualifications
  for select using (auth.uid() is not null);

create policy "admin_all" on public.time_slots
  for all using (public.is_admin()) with check (public.is_admin());
create policy "authenticated_read" on public.time_slots
  for select using (auth.uid() is not null);

create policy "admin_all" on public.elective_slot_blocks
  for all using (public.is_admin()) with check (public.is_admin());
create policy "authenticated_read" on public.elective_slot_blocks
  for select using (auth.uid() is not null);

create policy "admin_all" on public.constraints
  for all using (public.is_admin()) with check (public.is_admin());
create policy "authenticated_read" on public.constraints
  for select using (auth.uid() is not null);

-- ---------- timetable versions & entries ----------

create policy "admin_all" on public.timetable_versions
  for all using (public.is_admin()) with check (public.is_admin());
create policy "published_read" on public.timetable_versions
  for select using (status = 'published' and auth.uid() is not null);

create policy "admin_all" on public.timetable_entries
  for all using (public.is_admin()) with check (public.is_admin());
create policy "faculty_own_published" on public.timetable_entries
  for select using (
    faculty_id = public.my_faculty_id()
    and exists (
      select 1 from public.timetable_versions v
      where v.id = timetable_entries.version_id and v.status = 'published'
    )
  );
create policy "student_section_published" on public.timetable_entries
  for select using (
    section_id = public.my_section_id()
    and exists (
      select 1 from public.timetable_versions v
      where v.id = timetable_entries.version_id and v.status = 'published'
    )
  );

-- ---------- substitution ----------

create policy "admin_all" on public.substitution_requests
  for all using (public.is_admin()) with check (public.is_admin());
create policy "faculty_read_involved" on public.substitution_requests
  for select using (
    requester_faculty_id = public.my_faculty_id()
    or exists (
      select 1 from public.substitution_candidates c
      where c.request_id = substitution_requests.id
        and c.faculty_id = public.my_faculty_id()
    )
  );
create policy "faculty_create_own" on public.substitution_requests
  for insert with check (requester_faculty_id = public.my_faculty_id());
create policy "faculty_update_own" on public.substitution_requests
  for update
  using (requester_faculty_id = public.my_faculty_id())
  with check (requester_faculty_id = public.my_faculty_id());

create policy "admin_all" on public.substitution_candidates
  for all using (public.is_admin()) with check (public.is_admin());
create policy "candidate_read_own" on public.substitution_candidates
  for select using (faculty_id = public.my_faculty_id());
create policy "candidate_respond_own" on public.substitution_candidates
  for update
  using (faculty_id = public.my_faculty_id())
  with check (faculty_id = public.my_faculty_id());

create policy "admin_all" on public.substitution_penalties
  for all using (public.is_admin()) with check (public.is_admin());
create policy "faculty_read_own" on public.substitution_penalties
  for select using (faculty_id = public.my_faculty_id());

-- ---------- users & notifications ----------

create policy "admin_all" on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());
create policy "user_read_own" on public.profiles
  for select using (auth.uid() = user_id);
-- Self-signup may only create faculty/student profiles; admins are
-- provisioned out-of-band (SQL editor / service_role).
create policy "user_insert_self" on public.profiles
  for insert with check (auth.uid() = user_id and role in ('faculty', 'student'));

create policy "admin_read" on public.device_tokens
  for select using (public.is_admin());
create policy "owner_all" on public.device_tokens
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "admin_read" on public.notifications
  for select using (public.is_admin());
create policy "owner_read" on public.notifications
  for select using (auth.uid() = user_id);
create policy "owner_mark_read" on public.notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- Notification rows are created by the backend (service_role bypasses RLS).
