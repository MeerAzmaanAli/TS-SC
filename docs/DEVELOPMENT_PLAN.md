# TS-SC — Development Plan

**Project:** Smart Classroom & Timetable Scheduler (TS-SC)
**Repo:** `MeerAzmaanAli/TS-SC`
**Timeline:** Jul–Dec 2026 (B.Tech major project, SVVV Indore)
**Team:** Meer Azmaan Ali, Harsh Mehadele, Kasif Murad, Pushkar Kumawat
**Guide:** Prof. Akash Kanugo

This plan breaks the build into phases with concrete milestones. Each phase
ends with something demoable. See `ARCHITECTURE.md` for the system design.

**Working conventions**

- `main` is always deployable. Feature work happens on short-lived branches,
  merged via pull request with one reviewer.
- Commit messages: `<area>: <what changed>` (e.g. `solver: add room capacity constraint`).
- Every phase ends with its acceptance criteria checked off before moving on.

---

## Phase 0 — Repo setup & foundations (Week 1)

- [x] Architecture plan and development plan in `docs/`
- [ ] Monorepo layout: `frontend/`, `solver/`, `supabase/` (migrations, seed)
- [ ] Tooling: Node + pnpm, Python 3.12 + venv, pre-commit (lint/format)
- [ ] `.env.example` files for every component (no secrets committed)

**Done when:** fresh clone → documented setup steps → each component boots
"hello world".

## Phase 1 — Data layer (Weeks 2–3)

- [ ] Supabase schema migration for all tables in `ARCHITECTURE.md` §4
      (institutions → notifications), with foreign keys and indexes
- [ ] RLS policies for `admin` / `faculty` / `student` (see §7)
- [ ] `profiles` table linking `auth.users` to roles (+ faculty/section links)
- [ ] Seed script with realistic demo data (2 departments, ~10 faculty,
      ~8 rooms, ~12 courses, 4 sections, full slot grid)
- [ ] Document the ER diagram in `docs/`

**Done when:** seed runs cleanly; a faculty login sees only its own rows;
a student login sees only its section.

## Phase 2 — Admin entity management (Weeks 4–5)

- [ ] Admin dashboard shell + navigation
- [ ] CRUD screens: rooms, courses, faculty, sections, qualifications,
      time-slot grid, elective slot-blocks, constraints
- [ ] Form validation with clear inline errors; safe-delete (block when
      referenced, listing dependents) per REQ-1…REQ-6

**Done when:** an admin can enter the full demo dataset through the UI alone.

## Phase 3 — Solver microservice (Weeks 6–8)

- [ ] FastAPI service: `POST /generate`, `GET /health`, Docker image
- [ ] Snapshot loader: entities + constraints JSON → solver model
- [ ] Decision variables: one per required course session → (slot, room, faculty)
- [ ] Hard constraints (REQ-9): no double-booking; capacity/type fit;
      qualification; load ≤ max; electives only in reserved blocks
- [ ] Soft constraints as weighted objective (REQ-10): gaps, day spread,
      load balance
- [ ] Infeasibility reporting: return the specific unsatisfiable constraint
      set (REQ-11), surfaced verbatim by the UI

**Done when:** demo dataset generates a conflict-free timetable in under
2 minutes; an over-constrained input returns a named cause.

## Phase 4 — Generation, review & publish (Weeks 9–10)

- [ ] "Generate Timetable" action → snapshot → solver → draft
      `timetable_versions` + `timetable_entries`
- [ ] Conflict Inspector: list soft-constraint violations per draft (REQ-14)
- [ ] Publish / unpublish; exactly one published version per section (REQ-15, REQ-16)
- [ ] Faculty & Student read-only weekly views (REQ-19, REQ-20)

**Done when:** end-to-end demo: data in → generate → inspect → publish →
faculty/student see their schedules.

## Phase 5 — Substitution engine (Weeks 11–13)

- [ ] Tables: `substitution_requests`, `substitution_candidates`,
      `substitution_penalties`
- [ ] Candidate computation: P1 (section's faculty, free) → P2 (same course,
      free) → P3 (other faculty, free)
- [ ] Fan-out + inbox; deadline = lecture start + 10 min
- [ ] Resolution: highest priority wins; tie-break = lowest weekly load,
      then earliest response
- [ ] No-acceptance path: lecture marked free, students notified
- [ ] Penalty recording on reject/timeout + Admin repeat-offender report
- [ ] Faculty "Request substitute" UI + candidate inbox (accept/reject)

**Done when:** scripted drill — request → two accepts → P1 wins; request →
silence → students see "lecture free"; penalties visible to admin.

## Phase 6 — Push notifications (Week 14)

- [ ] Firebase project + FCM integration; `device_tokens` table
- [ ] Backend sender on substitution events (request, assigned, lecture free)
- [ ] Student/faculty notification inbox in the app
- [ ] Permission/registration flow on first login

**Done when:** substitution drill delivers real push notifications to
enrolled test devices.

## Phase 7 — Hardening & submission (Weeks 15–16)

- [ ] Load test with a larger synthetic dataset; record timings
- [ ] RLS penetration check (attempt cross-role reads via API)
- [ ] Admin User Guide PDF; in-app tooltips pass
- [ ] README, demo video script, final report figures
- [ ] Code freeze → tag `v1.0`

**Done when:** checklist above is green and the guide PDF is in the repo.

---

## Suggested task split (4 members)

| Member | Primary ownership |
|---|---|
| Meer Azmaan Ali | Solver microservice (Phase 3), generation flow |
| Harsh Mehadele | Supabase schema + RLS + seed (Phase 1) |
| Kasif Murad | React frontend: admin + role views (Phases 2, 4) |
| Pushkar Kumawat | Substitution engine + push (Phases 5–6) |

Everyone reviews everyone else's PRs; Phase 7 is all hands.

## Risks

| Risk | Mitigation |
|---|---|
| Solver too slow on real data | Start Phase 3 early; keep a smaller "demo mode" dataset |
| RLS misconfiguration leaks data | Phase 7 penetration check is mandatory, not optional |
| FCM setup delays | Begin Firebase project in Phase 5 in parallel |
| Scope creep (new features) | Freeze scope after Phase 4; new ideas go to a v2 backlog |

## Definition of done (project)

- [ ] Working platform: data in → conflict-free timetable out → role views
- [ ] Substitution flow with priorities, deadline, penalties, push notifications
- [ ] Conflict Inspector + infeasibility explanations
- [ ] Admin User Guide PDF
- [ ] Tagged `v1.0` in `MeerAzmaanAli/TS-SC`
