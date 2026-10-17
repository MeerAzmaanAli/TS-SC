# TS-SC — Architecture Plan

**Project:** Smart Classroom & Timetable Scheduler (TS-SC)
**Repo:** `MeerAzmaanAli/TS-SC`
**Version:** 1.0 (draft)
**Date:** 2026-10-17

This document describes the system architecture for TS-SC, a web platform that
automatically generates conflict-free class timetables and handles live
faculty substitution with push notifications.

---

## 1. Goals

1. Eliminate manual, spreadsheet-driven timetabling.
2. Generate complete, conflict-free timetables automatically from institutional data.
3. Give Admin, Faculty, and Student users role-appropriate views.
4. Handle day-of substitution requests automatically with a priority-based matching engine.
5. Surface *why* a configuration is infeasible instead of failing silently.

## 2. System context

```
                    ┌──────────────────────────────┐
                    │        React Frontend        │
                    │  Admin · Faculty · Student   │
                    └──────┬───────────────┬───────┘
                           │               │
              Supabase JS   │               │  HTTPS / JSON
                           ▼               ▼
              ┌────────────────────┐  ┌────────────────────┐
              │     Supabase       │  │  Solver Microservice│
              │  Postgres + Auth   │  │  FastAPI + OR-Tools │
              │  RLS · Realtime    │  │  CP-SAT             │
              └─────────┬──────────┘  └────────────────────┘
                        │
                        ▼
              ┌────────────────────┐
              │  Push Provider     │
              │  (FCM via Edge Fn) │
              └────────────────────┘
```

Three runtime components plus one external push provider. The frontend never
talks to the database except through Supabase; it never runs the solver
itself — generation is delegated to the solver microservice.

## 3. Components

### 3.1 Frontend — React

- Single-page app (Vite + React + TypeScript recommended).
- Three role-based shells sharing one design system:
  - **Admin dashboard:** CRUD for rooms, courses, faculty, sections,
    qualifications, time-slot grid, elective slot-blocks; "Generate Timetable"
    action; Conflict Inspector; publish/unpublish.
  - **Faculty view:** read-only weekly schedule; "Request substitute" action;
    incoming substitution requests inbox (accept/reject).
  - **Student view:** read-only section timetable; substitution / free-lecture
    notifications inbox.
- Talks to Supabase directly for CRUD (via Row-Level Security) and to the
  solver service for generation. Receives push notifications for substitution
  events.

### 3.2 Data & auth layer — Supabase (PostgreSQL)

- Single source of truth for all entities, constraints, timetable versions,
  substitution requests, penalties, and notification records.
- **Supabase Auth** for login (email/password for V1).
- **Row-Level Security (RLS)** enforces role scoping in the database itself,
  so Faculty/Student cannot read outside their scope even via direct API calls.
- **Realtime** (optional) for live updates of substitution request status.

### 3.3 Solver microservice — FastAPI + Google OR-Tools CP-SAT

- Standalone Python service (kept separate because Supabase Edge Functions
  have execution-time limits unsuitable for solver runs).
- `POST /generate`: accepts a snapshot JSON of entities + constraints,
  returns timetable entries or an infeasibility report.
- `GET /health`: liveness probe.
- Stateless: all input comes in the request; all output is returned in the
  response and then persisted by the caller.

### 3.4 Substitution engine

Lives in the backend tier (Supabase Edge Function or a small FastAPI module —
decision below). Responsibilities:

1. On a faculty substitution request, compute candidate faculty in priority order:
   - **P1** — faculty already teaching that section AND free in the slot.
   - **P2** — faculty teaching the same course AND free in the slot.
   - **P3** — other faculty free in the slot.
2. Fan out the request to candidates (push notification + inbox entry).
3. Accept responses until the deadline (**10 minutes after the lecture starts**).
4. Resolve: highest compatibility wins (P1 > P2 > P3); tie-break inside one
   level by lowest current weekly load, then earliest response.
5. If nobody accepts by the deadline, mark the lecture free and notify students.
6. Record a **penalty** row for every candidate who rejects (or times out),
   visible to Admin for repeated-rejection review.

### 3.5 Push notifications

- Firebase Cloud Messaging (FCM) for Android/web push.
- A backend sender (Edge Function) dispatches on substitution events:
  request → candidates, acceptance → requester + students, no-acceptance →
  students ("lecture free").
- Device tokens stored per user in `device_tokens`.

## 4. Data model (core tables)

| Table | Purpose |
|---|---|
| `institutions` | Future multi-institution support (V1: single row) |
| `departments`, `programs` | Academic organisation |
| `sections` | Student groups sharing a timetable (program, semester, strength) |
| `rooms` | type, capacity, equipment tags |
| `courses` | credits, sessions/week, duration, lab-required flag |
| `faculty` | department, max weekly load |
| `faculty_qualifications` | many-to-many faculty ↔ courses they may teach |
| `time_slots` | weekly grid (day, period, start/end) |
| `elective_slot_blocks` | slots reserved exclusively for electives |
| `constraints` | configurable hard/soft rules (not hardcoded) |
| `timetable_versions` | draft / published generations |
| `timetable_entries` | one row per scheduled session (version, slot, room, faculty, course, section) |
| `substitution_requests` | requester, lecture ref, deadline, status |
| `substitution_candidates` | per-candidate priority, response, responded_at |
| `substitution_penalties` | faculty, request ref, reason (rejected / timed-out), created_at |
| `device_tokens` | user ↔ FCM token |
| `notifications` | inbox record of every push sent |

## 5. Timetable generation flow

1. Admin clicks **Generate Timetable**.
2. Frontend snapshots entities + constraints from Supabase.
3. Snapshot POSTed to solver `/generate`.
4. Solver builds one decision variable per required course session:
   `(time_slot, room, faculty)` and enforces:
   - **Hard:** no double-booking of faculty/room/section per slot; room
     capacity & type fit; faculty qualified; faculty load ≤ max; elective
     sessions only in reserved blocks.
   - **Soft (weighted objective):** minimise gaps, spread sessions across days,
     balance faculty load.
5. On success: entries written to `timetable_entries` under a new **draft**
   `timetable_versions` row.
6. On infeasibility: solver returns the unsatisfiable constraint set; UI shows
   the specific cause (not a generic error).
7. Admin reviews soft-constraint violations in the **Conflict Inspector**,
   then publishes → exactly one published version per section becomes visible
   to Faculty/Student.

## 6. Substitution flow (detailed)

```
Faculty raises request
        │
        ▼
Compute candidates (P1 → P2 → P3), all free in the slot
        │
        ▼
Fan-out: push + inbox to candidates (deadline = lecture_start + 10 min)
        │
        ├── accept(s) ──► pick highest priority (tie: lowest load, then earliest)
        │                      ├── notify requester + students of substitute
        │                      └── record penalties for rejecters
        │
        └── none ──► mark lecture free ──► notify students "lecture free"
```

- Penalty rows accumulate per faculty; Admin dashboard shows a
  repeated-rejection report.
- All state transitions are idempotent so retries and double-taps are safe.

## 7. Auth & authorization

- Supabase Auth (email/password). A `profiles` table maps `auth.users.id →
  role` (`admin` | `faculty` | `student`) plus `faculty_id` / `section_id` links.
- RLS policies:
  - Admin: full read/write.
  - Faculty: read own `timetable_entries` (via published versions), read/write
    own substitution requests and candidate responses.
  - Student: read own section's published timetable + own notifications.
- Service-role key used **only** server-side (solver persistence, push sender).

## 8. API contracts

### Solver service

- `POST /generate` — body: `{ entities: {...}, constraints: [...] }`;
  response: `{ version: {...}, entries: [...], violations: [...] }` or
  `{ infeasible: true, causes: [...] }`.
- `GET /health` — `{ "status": "ok" }`.

### Substitution (Edge Function or FastAPI module)

- `POST /substitutions` — create request (faculty).
- `POST /substitutions/{id}/respond` — accept/reject (candidate faculty).
- `GET /substitutions/inbox` — candidate's pending requests.
- Push delivery is a side effect of each transition.

## 9. Deployment

| Piece | Target (V1) |
|---|---|
| Frontend | Vercel (static) |
| Supabase | Hosted (Postgres + Auth + Edge Functions) |
| Solver | Small compute instance (e.g. Fly.io / Render) via Docker |
| Push | Firebase Cloud Messaging |

No specialised hardware; CP-SAT solves institution-scale instances in
seconds to a few minutes on commodity compute.

## 10. Non-functional notes

- **Performance:** generation in minutes for hundreds of sessions; CRUD and
  dashboards < 2 s.
- **Reliability:** generation failures always explain themselves; substitution
  resolution is idempotent.
- **Security:** HTTPS everywhere; RLS as the authorization backstop; service
  keys never shipped to the client.
- **Maintainability:** constraints stored as data rows, not code branches.
- **Extensibility:** institution-level foreign keys throughout for future
  multi-tenancy.

## 11. Open decisions

1. Substitution engine hosting: Supabase Edge Function vs. FastAPI module
   (recommend Edge Function for colocation with RLS, unless long polling is needed).
2. Web push vs. native app shell for FCM on mobile (V1: web push).
3. Tie-break rule inside one priority level (proposed: lowest weekly load, then earliest response).
