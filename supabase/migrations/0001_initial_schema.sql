-- TS-SC initial schema (Phase 1)
-- Run in the Supabase SQL editor, then supabase/seed.sql

-- ---------- core organisation ----------

create table institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table departments (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institutions(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table programs (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references departments(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table sections (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs(id) on delete cascade,
  name text not null,
  semester int not null check (semester > 0),
  strength int not null check (strength > 0),
  created_at timestamptz not null default now()
);

-- ---------- schedulable entities ----------

create table rooms (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institutions(id) on delete cascade,
  name text not null,
  room_type text not null default 'classroom'
    check (room_type in ('classroom', 'lab', 'seminar')),
  capacity int not null check (capacity > 0),
  equipment_tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table courses (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references departments(id) on delete cascade,
  code text not null,
  name text not null,
  credits int not null default 3,
  sessions_per_week int not null check (sessions_per_week > 0),
  lab_required boolean not null default false,
  created_at timestamptz not null default now(),
  unique (department_id, code)
);

create table faculty (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institutions(id) on delete cascade,
  name text not null,
  email text not null unique,
  department_id uuid references departments(id) on delete set null,
  max_weekly_load int not null default 18 check (max_weekly_load > 0),
  created_at timestamptz not null default now()
);

create table faculty_qualifications (
  faculty_id uuid not null references faculty(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  primary key (faculty_id, course_id)
);

create table time_slots (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institutions(id) on delete cascade,
  day_of_week int not null check (day_of_week between 1 and 7),
  period int not null check (period > 0),
  starts_at time not null,
  ends_at time not null,
  unique (institution_id, day_of_week, period)
);

create table elective_slot_blocks (
  time_slot_id uuid primary key references time_slots(id) on delete cascade
);

-- configurable hard/soft rules (not hardcoded)
create table constraints (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institutions(id) on delete cascade,
  key text not null,
  value jsonb not null,
  kind text not null default 'soft' check (kind in ('hard', 'soft')),
  unique (institution_id, key)
);

-- ---------- timetable versions & entries ----------

create table timetable_versions (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institutions(id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  created_by uuid,
  created_at timestamptz not null default now(),
  published_at timestamptz
);

create table timetable_entries (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references timetable_versions(id) on delete cascade,
  section_id uuid not null references sections(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  faculty_id uuid not null references faculty(id) on delete cascade,
  room_id uuid not null references rooms(id) on delete cascade,
  time_slot_id uuid not null references time_slots(id) on delete cascade,
  is_elective boolean not null default false
);
create index timetable_entries_version_idx on timetable_entries (version_id);
create index timetable_entries_faculty_idx on timetable_entries (faculty_id);
create index timetable_entries_section_idx on timetable_entries (section_id);

-- ---------- substitution ----------

create table substitution_requests (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institutions(id) on delete cascade,
  requester_faculty_id uuid not null references faculty(id) on delete cascade,
  timetable_entry_id uuid not null references timetable_entries(id) on delete cascade,
  reason text,
  deadline timestamptz not null,
  status text not null default 'open'
    check (status in ('open', 'assigned', 'unfilled', 'expired')),
  assigned_faculty_id uuid references faculty(id) on delete set null,
  created_at timestamptz not null default now()
);

create table substitution_candidates (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references substitution_requests(id) on delete cascade,
  faculty_id uuid not null references faculty(id) on delete cascade,
  priority int not null check (priority in (1, 2, 3)),
  response text not null default 'pending'
    check (response in ('pending', 'accepted', 'rejected', 'timed_out')),
  responded_at timestamptz,
  unique (request_id, faculty_id)
);

create table substitution_penalties (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institutions(id) on delete cascade,
  faculty_id uuid not null references faculty(id) on delete cascade,
  request_id uuid references substitution_requests(id) on delete set null,
  reason text not null check (reason in ('rejected', 'timed_out')),
  created_at timestamptz not null default now()
);
create index substitution_penalties_faculty_idx on substitution_penalties (faculty_id);

-- ---------- users & notifications ----------

create table profiles (
  user_id uuid primary key,
  role text not null check (role in ('admin', 'faculty', 'student')),
  faculty_id uuid references faculty(id) on delete set null,
  section_id uuid references sections(id) on delete set null,
  created_at timestamptz not null default now()
);

create table device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(user_id) on delete cascade,
  token text not null,
  platform text not null default 'web',
  created_at timestamptz not null default now(),
  unique (user_id, token)
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(user_id) on delete cascade,
  title text not null,
  body text not null,
  kind text not null default 'info',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications (user_id);

-- ---------- row level security ----------
-- Phase 1 adds role-scoped policies here. Enabling RLS now so nothing
-- ships without it; service_role bypasses RLS for server-side jobs.

alter table institutions enable row level security;
alter table departments enable row level security;
alter table programs enable row level security;
alter table sections enable row level security;
alter table rooms enable row level security;
alter table courses enable row level security;
alter table faculty enable row level security;
alter table faculty_qualifications enable row level security;
alter table time_slots enable row level security;
alter table elective_slot_blocks enable row level security;
alter table constraints enable row level security;
alter table timetable_versions enable row level security;
alter table timetable_entries enable row level security;
alter table substitution_requests enable row level security;
alter table substitution_candidates enable row level security;
alter table substitution_penalties enable row level security;
alter table profiles enable row level security;
alter table device_tokens enable row level security;
alter table notifications enable row level security;

-- TODO(phase-1): add policies —
--   admin: full access;
--   faculty: own timetable_entries (published versions), own substitution rows;
--   student: own section's published timetable + own notifications.
