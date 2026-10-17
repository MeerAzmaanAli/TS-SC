# TS-SC database (Supabase / PostgreSQL)

## Apply

1. Create a Supabase project.
2. In the SQL editor, run `migrations/0001_initial_schema.sql`.
3. Then run `seed.sql` for demo data.
4. Create users in **Authentication**, then link them in `profiles`:

```sql
insert into profiles (user_id, role) values ('<auth-user-uuid>', 'admin');
-- faculty: also set faculty_id; student: also set section_id
```

## Notes

- RLS is enabled on all tables; role-scoped policies land in Phase 1
  (see the TODO at the end of the migration).
- `service_role` key bypasses RLS — use it only server-side
  (solver persistence, push sender).
