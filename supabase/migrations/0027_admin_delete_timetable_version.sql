-- Migration 0027: Stored procedure to atomically discard/delete a timetable version and clean all DB entries
create or replace function public.admin_delete_timetable_version(
  p_version_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
begin
  -- 1. Check if caller is admin
  if not public.is_admin() and current_user not in ('postgres', 'service_role') then
    return jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: Only administrators can delete timetable versions.'
    );
  end if;

  -- 2. Delete any substitution records tied to entries of this version
  delete from public.substitution_penalties sp
  using public.substitution_requests sr, public.timetable_entries te
  where sp.request_id = sr.id
    and sr.timetable_entry_id = te.id
    and te.version_id = p_version_id;

  delete from public.substitution_candidates sc
  using public.substitution_requests sr, public.timetable_entries te
  where sc.request_id = sr.id
    and sr.timetable_entry_id = te.id
    and te.version_id = p_version_id;

  delete from public.substitution_requests sr
  using public.timetable_entries te
  where sr.timetable_entry_id = te.id
    and te.version_id = p_version_id;

  -- 3. Delete all timetable entries for this version
  delete from public.timetable_entries
  where version_id = p_version_id;
  get diagnostics v_count = row_count;

  -- 4. Delete the version record itself
  delete from public.timetable_versions
  where id = p_version_id;

  return jsonb_build_object(
    'success', true,
    'deleted_entries', v_count,
    'message', 'Timetable version and all associated entries deleted successfully.'
  );
end;
$$;

grant execute on function public.admin_delete_timetable_version(uuid)
  to authenticated, service_role;

