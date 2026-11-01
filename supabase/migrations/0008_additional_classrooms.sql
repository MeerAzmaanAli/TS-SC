-- 0008_additional_classrooms.sql
-- Expand available institutional theory classrooms to accommodate fixed-classroom scheduling per section.

do $$
declare
  v_inst uuid;
  i int;
  r_name text;
begin
  select id into v_inst from institutions limit 1;
  if v_inst is not null then
    for i in 11..16 loop
      r_name := 'CR-' || (100 + i);
      if not exists (select 1 from rooms where name = r_name and institution_id = v_inst) then
        insert into rooms (institution_id, name, room_type, capacity)
        values (v_inst, r_name, 'classroom', 70);
      end if;
    end loop;
  end if;
end $$;

