-- 0019_add_institute_to_departments.sql
-- Add institute column to departments table and default existing to SVIIT

alter table departments
  add column if not exists institute text not null default 'Shri Vaishnav Institute of Information Technology';

-- Update any existing rows without an institute or set to SVIIT
update departments
  set institute = 'Shri Vaishnav Institute of Information Technology'
  where institute is null or institute = '';

