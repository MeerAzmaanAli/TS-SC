# TS-SC solver microservice

Standalone FastAPI service hosting the Google OR-Tools CP-SAT timetable
solver. Kept separate from Supabase because Edge Functions have execution
time limits unsuitable for solver runs.

## Run locally

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Docker

```bash
docker build -t ts-sc-solver .
docker run -p 8000:8000 ts-sc-solver
```

## API

- `GET /health` → `{ "status": "ok" }`
- `POST /generate` → timetable entries or an infeasibility report
  (see `app/schemas.py`; full implementation in Phase 3)
