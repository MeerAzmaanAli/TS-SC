-- Clean wipe all substitution operational data
-- (requests, candidate fan-outs, and penalties)

delete from public.substitution_penalties;
delete from public.substitution_candidates;
delete from public.substitution_requests;

