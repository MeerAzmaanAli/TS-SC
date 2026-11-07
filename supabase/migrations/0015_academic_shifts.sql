-- 0015_academic_shifts.sql
-- Supports dual-shift institutional scheduling:
-- Shift 1: 08:15 to 14:45 (Periods 1-6) - for 1st & 4th Years
-- Shift 2: 10:15 to 16:45 (Periods 3-8) - for 2nd & 3rd Years
-- Common Lunch: 12:15 to 12:45

-- 1. Add shift column to sections table (1 or 2)
alter table if exists sections
  add column if not exists shift int not null default 1 check (shift in (1, 2)),
  add column if not exists academic_year int default 1 check (academic_year between 1 and 4);

-- 2. Create academic_year_shifts table for institutional configuration
create table if not exists academic_year_shifts (
  institution_id uuid not null references institutions(id) on delete cascade,
  academic_year int not null check (academic_year between 1 and 4),
  shift int not null check (shift in (1, 2)),
  timing_label text not null,
  starts_at time not null,
  ends_at time not null,
  updated_at timestamptz not null default now(),
  primary key (institution_id, academic_year)
);

-- 3. Enable RLS
alter table academic_year_shifts enable row level security;

-- Policies: Everyone can read shifts, only admin can update
create policy "Allow read access to academic_year_shifts"
  on academic_year_shifts for select
  using (true);

create policy "Allow authenticated admin full access to academic_year_shifts"
  on academic_year_shifts for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

