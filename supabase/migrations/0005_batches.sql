-- Migration 0005: Add batch support to sections and timetable entries

alter table sections
  add column if not exists batch_count int not null default 1 check (batch_count >= 1);

alter table timetable_entries
  add column if not exists batch int default null check (batch is null or batch >= 1);

create index if not exists timetable_entries_batch_idx on timetable_entries (section_id, batch);
