-- Migration 0011: Delete all existing substitution requests, candidates, and penalties

-- 1. Truncate / delete all records cleanly
delete from public.substitution_penalties;
delete from public.substitution_candidates;
delete from public.substitution_requests;

-- 2. Optional administrative RPC to clear all substitution history anytime from admin tools
create or replace function public.clear_all_substitution_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  select count(*) into v_count from public.substitution_requests;
  
  delete from public.substitution_penalties;
  delete from public.substitution_candidates;
  delete from public.substitution_requests;

  return jsonb_build_object(
    'success', true,
    'deleted_count', v_count,
    'message', 'All substitution requests, candidate logs, and penalties have been cleared.'
  );
end;
$$;

grant execute on function public.clear_all_substitution_data() to anon, authenticated, service_role;

