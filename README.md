# TS-SC — Smart Classroom & Timetable Scheduler

Web platform that automatically generates conflict-free class timetables and
handles live faculty substitution with push notifications.

B.Tech major project — Shri Vaishnav Institute of Information Technology,
SVVV Indore (Jul–Dec 2026).

## Structure

| Directory | What lives here |
|---|---|
| `frontend/` | React + TypeScript app (Admin / Faculty / Student views) |
| `solver/` | FastAPI microservice hosting the OR-Tools CP-SAT solver |
| `supabase/` | PostgreSQL migrations, RLS policies, seed data |
| `docs/` | Architecture plan, development plan |

## Quick start

```bash
# 1. Frontend
cd frontend && npm install && npm run dev

# 2. Solver
cd solver && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# 3. Database
# Create a Supabase project, then run supabase/migrations/*.sql
# in the SQL editor, followed by supabase/seed.sql
```

Copy `.env.example` to the appropriate `.env` files and fill in your
Supabase URL / keys before running.

## Docs

- `docs/ARCHITECTURE.md` — system design
- `docs/DEVELOPMENT_PLAN.md` — phased build plan
