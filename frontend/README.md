# TS-SC frontend

React + TypeScript + Vite. Three role-based views share one shell;
Supabase is the data layer (see `src/lib/supabase.ts`).

## Run

```bash
npm install
cp ../.env.example .env   # then fill in VITE_* values
npm run dev               # http://localhost:5173
```

## Roadmap

- Phase 2: Admin entity CRUD
- Phase 4: generation UI, Conflict Inspector, publish, role views
- Phase 5: substitution request UI + candidate inbox
- Phase 6: push notification registration + inbox
