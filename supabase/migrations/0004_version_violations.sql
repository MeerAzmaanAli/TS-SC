-- TS-SC: store solver soft-constraint statistics on each version (Phase 4)
-- so the Conflict Inspector can review a draft without re-running the solver.

alter table timetable_versions
  add column violations jsonb not null default '{}';
