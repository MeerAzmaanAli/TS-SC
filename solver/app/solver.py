"""CP-SAT timetable solver (Phase 3).

Model
-----
One "session" per required course meeting: for every (section, course) pair in
``section_courses`` we create ``sessions_per_week`` session slots to fill.

Decision variables per session ``i``:
  - ``slot[i, t]`` — session ``i`` takes time slot ``t``      (bool)
  - ``room[i, r]`` — session ``i`` takes room ``r``            (bool)
  - ``fac[i, f]``  — session ``i`` is taught by faculty ``f`` (bool)

Hard constraints (REQ-9):
  - exactly one slot / room / faculty per session
  - no section, room or faculty double-booked in a slot
  - room capacity fits the section; lab courses need lab rooms
  - faculty must be qualified for the course
  - faculty weekly load within its maximum
  - elective courses only inside reserved slot-blocks;
    core courses never inside them

Soft constraints (weighted objective, REQ-10):
  - minimise single-period gaps inside a section's day
  - spread each course's sessions across distinct days
  - balance faculty load (minimise the maximum load)

If the model is infeasible, :func:`diagnose` relaxes constraint groups one at
a time to name the culprit instead of failing silently (REQ-11).
"""

from __future__ import annotations

from dataclasses import dataclass, field

from ortools.sat.python import cp_model

from .schemas import (
    Course,
    GenerateRequest,
    GenerateResponse,
    Section,
    TimeSlot,
    TimetableEntry,
    Weights,
)

# Relaxation groups understood by _build_model / diagnose.
_RELAX_LOADS = "loads"
_RELAX_ROOMS = "rooms"
_RELAX_QUALIFICATIONS = "qualifications"
_RELAX_ELECTIVES = "electives"


class _InfeasibleNow(Exception):
    """Raised during model construction when infeasibility is structural."""


@dataclass
class _Session:
    section_id: str
    course_id: str
    strength: int
    lab_required: bool
    is_elective: bool
    batch: Optional[int] = None


@dataclass
class _BuiltModel:
    model: cp_model.CpModel
    sessions: list[_Session]
    slot_of: dict[tuple[int, int], object] = field(default_factory=dict)
    room_of: dict[tuple[int, int], object] = field(default_factory=dict)
    fac_of: dict[tuple[int, int], object] = field(default_factory=dict)
    fac_load: dict[int, object] = field(default_factory=dict)
    gaps: list[object] = field(default_factory=list)
    used_days: list[object] = field(default_factory=list)
    max_load: object = None


def _build_model(req: GenerateRequest, relax: frozenset[str]) -> _BuiltModel:
    sections = {s.id: s for s in req.sections}
    courses = {c.id: c for c in req.courses}
    faculty = list(req.faculty)
    rooms = list(req.rooms)
    slots = list(req.time_slots)
    fac_idx = {f.id: i for i, f in enumerate(faculty)}
    room_idx = {r.id: i for i, r in enumerate(rooms)}
    slot_idx = {t.id: i for i, t in enumerate(slots)}

    qualified = {
        (q.faculty_id, q.course_id) for q in req.qualifications
    }
    elective_blocks = set(req.elective_blocks)

    # ---- sessions -----------------------------------------------------
    sessions: list[_Session] = []
    for sc in req.section_courses:
        sec = sections.get(sc.section_id)
        crs = courses.get(sc.course_id)
        if sec is None or crs is None:
            raise ValueError(
                f"section_courses references unknown section/course: {sc}"
            )
        n = sc.sessions_per_week or crs.sessions_per_week
        b_count = max(1, getattr(sec, "batch_count", 1) or 1)
        if crs.lab_required and b_count > 1:
            batch_strength = (sec.strength + b_count - 1) // b_count
            for b in range(1, b_count + 1):
                for _ in range(n):
                    sessions.append(
                        _Session(
                            section_id=sec.id,
                            course_id=crs.id,
                            strength=batch_strength,
                            lab_required=True,
                            is_elective=crs.is_elective,
                            batch=b,
                        )
                    )
        else:
            for _ in range(n):
                sessions.append(
                    _Session(
                        section_id=sec.id,
                        course_id=crs.id,
                        strength=sec.strength,
                        lab_required=crs.lab_required,
                        is_elective=crs.is_elective,
                        batch=None,
                    )
                )

    model = cp_model.CpModel()
    built = _BuiltModel(model=model, sessions=sessions)
    if not sessions:
        return built

    n_slots, n_rooms, n_fac = len(slots), len(rooms), len(faculty)

    def allowed_slots(s: _Session) -> list[int]:
        if s.is_elective:
            if _RELAX_ELECTIVES in relax:
                return list(range(n_slots))
            block = [slot_idx[b] for b in elective_blocks if b in slot_idx]
            if not block:
                raise _InfeasibleNow(
                    "elective course has no reserved slot-blocks"
                )
            return block
        if _RELAX_ELECTIVES in relax:
            return list(range(n_slots))
        return [i for i, t in enumerate(slots) if t.id not in elective_blocks]

    def allowed_faculty(s: _Session) -> list[int]:
        if _RELAX_QUALIFICATIONS in relax:
            return list(range(n_fac))
        out = [
            i
            for i, f in enumerate(faculty)
            if (f.id, s.course_id) in qualified
        ]
        if not out:
            raise _InfeasibleNow(
                f"no qualified faculty for course {s.course_id}"
            )
        return out

    def allowed_rooms(s: _Session) -> list[int]:
        if _RELAX_ROOMS in relax:
            return list(range(n_rooms))
        out = []
        for i, r in enumerate(rooms):
            if r.capacity < s.strength:
                continue
            if s.lab_required and r.room_type != "lab":
                continue
            out.append(i)
        if not out:
            raise _InfeasibleNow(
                f"no suitable room for course {s.course_id} "
                f"(strength {s.strength}, lab={s.lab_required})"
            )
        return out

    # ---- decision variables -------------------------------------------
    for si, s in enumerate(sessions):
        s_slots = allowed_slots(s)
        s_fac = allowed_faculty(s)
        s_rooms = allowed_rooms(s)
        for t in s_slots:
            built.slot_of[(si, t)] = model.NewBoolVar(f"slot_{si}_{t}")
        for r in s_rooms:
            built.room_of[(si, r)] = model.NewBoolVar(f"room_{si}_{r}")
        for fi in s_fac:
            built.fac_of[(si, fi)] = model.NewBoolVar(f"fac_{si}_{fi}")
        model.Add(sum(built.slot_of[(si, t)] for t in s_slots) == 1)
        model.Add(sum(built.room_of[(si, r)] for r in s_rooms) == 1)
        model.Add(sum(built.fac_of[(si, fi)] for fi in s_fac) == 1)

    # ---- no double booking (section / room / faculty per slot) -----------
    _add_clash_constraints(model, built, slots, rooms, faculty, sections)

    # Faculty load
    for fi, f in enumerate(faculty):
        load = sum(
            built.fac_of[(si, fi)]
            for si in range(len(sessions))
            if (si, fi) in built.fac_of
        )
        built.fac_load[fi] = load
        limit = 10**9 if _RELAX_LOADS in relax else f.max_weekly_load
        model.Add(load <= limit)

    # ---- single faculty per course per section (consistent instructor) ----
    _add_faculty_consistency_constraints(model, built, n_fac)

    # ---- daily course limits, no consecutive theory, and day spread ------
    _add_daily_distribution_constraints(model, built, slots, courses, sections)

    _add_soft_constraints(model, built, req, slots)

    return built


def _add_clash_constraints(
    model: cp_model.CpModel,
    built: _BuiltModel,
    slots,
    rooms,
    faculty,
    sections: dict[str, Section],
) -> None:
    """No section / room / faculty is in two places in one slot.

    Supports multi-batch laboratory scheduling:
      - Theory is section-wide; no batch can be in lab during theory.
      - If a section has >= b_count lab courses, batches are in lab simultaneously.
      - Different batches cannot take the same lab course in the same slot.
    """
    sessions = built.sessions
    n_slots = len(slots)

    # Pre-group sessions by section and batch
    sec_theory_sessions: dict[str, list[int]] = {}
    sec_batch_lab_sessions: dict[tuple[str, int], list[int]] = {}
    sec_course_lab_sessions: dict[tuple[str, str], list[int]] = {}
    sec_lab_courses: dict[str, set[str]] = {}

    for si, s in enumerate(sessions):
        if s.batch is None:
            sec_theory_sessions.setdefault(s.section_id, []).append(si)
        else:
            sec_batch_lab_sessions.setdefault((s.section_id, s.batch), []).append(si)
            sec_course_lab_sessions.setdefault((s.section_id, s.course_id), []).append(si)
            sec_lab_courses.setdefault(s.section_id, set()).add(s.course_id)

    for t in range(n_slots):
        # Section & batch clash
        for sec_id, sec in sections.items():
            b_count = max(1, getattr(sec, "batch_count", 1) or 1)
            theory_vars = [
                built.slot_of[(si, t)]
                for si in sec_theory_sessions.get(sec_id, [])
                if (si, t) in built.slot_of
            ]
            if theory_vars:
                model.Add(sum(theory_vars) <= 1)

            if b_count <= 1:
                # Single-batch section: standard clash
                lab_vars = [
                    built.slot_of[(si, t)]
                    for si in sec_batch_lab_sessions.get((sec_id, 1), [])
                    if (si, t) in built.slot_of
                ]
                all_sec_vars = theory_vars + lab_vars
                if all_sec_vars:
                    model.Add(sum(all_sec_vars) <= 1)
            else:
                batch_lab_vars: dict[int, list] = {}
                for b in range(1, b_count + 1):
                    b_vars = [
                        built.slot_of[(si, t)]
                        for si in sec_batch_lab_sessions.get((sec_id, b), [])
                        if (si, t) in built.slot_of
                    ]
                    batch_lab_vars[b] = b_vars
                    # 1. No batch double booking: batch cannot do both theory and lab, or 2 labs
                    if theory_vars or b_vars:
                        model.Add(sum(theory_vars) + sum(b_vars) <= 1)

                # 2. Parallel Lab Synchronization:
                # When section has >= b_count lab courses, all batches do lab together
                lab_courses = sec_lab_courses.get(sec_id, set())
                if len(lab_courses) >= b_count:
                    for b in range(2, b_count + 1):
                        model.Add(sum(batch_lab_vars[1]) == sum(batch_lab_vars[b]))

                # 3. Different lab courses per slot:
                # Batches cannot attend the same lab course in the same slot
                for cid in lab_courses:
                    c_vars = [
                        built.slot_of[(si, t)]
                        for si in sec_course_lab_sessions.get((sec_id, cid), [])
                        if (si, t) in built.slot_of
                    ]
                    if c_vars:
                        model.Add(sum(c_vars) <= 1)

        # room clash
        for r in range(len(rooms)):
            uses = []
            for si in range(len(sessions)):
                rv = built.room_of.get((si, r))
                sv = built.slot_of.get((si, t))
                if rv is not None and sv is not None:
                    use = model.NewBoolVar(f"use_room_{si}_{r}_{t}")
                    model.AddMultiplicationEquality(use, [rv, sv])
                    uses.append(use)
            if uses:
                model.Add(sum(uses) <= 1)

        # faculty clash
        for fi in range(len(faculty)):
            uses = []
            for si in range(len(sessions)):
                fv = built.fac_of.get((si, fi))
                sv = built.slot_of.get((si, t))
                if fv is not None and sv is not None:
                    use = model.NewBoolVar(f"use_fac_{si}_{fi}_{t}")
                    model.AddMultiplicationEquality(use, [fv, sv])
                    uses.append(use)
            if uses:
                model.Add(sum(uses) <= 1)


def _add_faculty_consistency_constraints(
    model: cp_model.CpModel,
    built: _BuiltModel,
    n_fac: int,
) -> None:
    """Ensure the same faculty member is assigned to all sessions of a course for a section.

    In the real world, a section is assigned a faculty member for a course, and that
    same faculty member conducts every lecture and practical session of that course.
    """
    sessions = built.sessions
    sec_course_sessions: dict[tuple[str, str], list[int]] = {}
    for si, s in enumerate(sessions):
        sec_course_sessions.setdefault((s.section_id, s.course_id), []).append(si)

    for (sec_id, crs_id), sis in sec_course_sessions.items():
        if len(sis) <= 1:
            continue
        si_0 = sis[0]
        for si_j in sis[1:]:
            for fi in range(n_fac):
                v0 = built.fac_of.get((si_0, fi))
                vj = built.fac_of.get((si_j, fi))
                if v0 is not None and vj is not None:
                    model.Add(v0 == vj)


def _add_daily_distribution_constraints(
    model: cp_model.CpModel,
    built: _BuiltModel,
    slots: list[TimeSlot],
    courses: dict[str, Course],
    sections: dict[str, Section],
) -> None:
    """Enforce pedagogical daily distribution and workload limits.

    1. Max daily sessions per course:
       - Theory courses: at most 1 session per day (if sessions <= days).
       - Theory courses: no consecutive periods of the same course on the same day.
       - Lab courses: at most 2 periods per day for any batch (standard lab block).
    2. Section daily student load cap:
       - Prevent dumping all periods on one or two days while leaving other weekdays empty.
    """
    sessions = built.sessions
    days = sorted({t.day_of_week for t in slots})
    n_days = len(days)
    if n_days <= 0:
        return

    slot_at = {(t.day_of_week, t.period): i for i, t in enumerate(slots)}
    p_max = max((len([t for t in slots if t.day_of_week == d]) for d in days), default=1)

    # 1. Course daily session limits and no consecutive theory sessions
    course_batch_sessions: dict[tuple[str, str, Optional[int]], list[int]] = {}
    for si, s in enumerate(sessions):
        course_batch_sessions.setdefault((s.section_id, s.course_id, s.batch), []).append(si)

    for (sec_id, crs_id, batch), sis in course_batch_sessions.items():
        crs = courses.get(crs_id)
        if crs is None:
            continue

        if not crs.lab_required:
            max_daily = max(1, (len(sis) + n_days - 1) // n_days)
        else:
            max_daily = min(2, len(sis))

        for d in days:
            day_vars = [
                built.slot_of[(si, t)]
                for si in sis
                for t, sl in enumerate(slots)
                if sl.day_of_week == d and (si, t) in built.slot_of
            ]
            if day_vars:
                model.Add(sum(day_vars) <= max_daily)

            # Theory courses cannot have consecutive periods of the same course on the same day
            if not crs.lab_required:
                periods = sorted({t.period for t in slots if t.day_of_week == d})
                for idx in range(len(periods) - 1):
                    p1, p2 = periods[idx], periods[idx + 1]
                    if p2 == p1 + 1:
                        t1 = slot_at.get((d, p1))
                        t2 = slot_at.get((d, p2))
                        if t1 is not None and t2 is not None:
                            p1_vars = [built.slot_of[(si, t1)] for si in sis if (si, t1) in built.slot_of]
                            p2_vars = [built.slot_of[(si, t2)] for si in sis if (si, t2) in built.slot_of]
                            if p1_vars and p2_vars:
                                model.Add(sum(p1_vars) + sum(p2_vars) <= 1)

    # 2. Section daily period cap to prevent overloading one day and leaving weekdays empty
    if n_days > 1:
        for sec_id, sec in sections.items():
            b_count = max(1, getattr(sec, "batch_count", 1) or 1)
            if b_count <= 1:
                sec_student_sis = [si for si, s in enumerate(sessions) if s.section_id == sec_id]
            else:
                sec_student_sis = [
                    si for si, s in enumerate(sessions)
                    if s.section_id == sec_id and (s.batch is None or s.batch == 1)
                ]
            s_sec = len(sec_student_sis)
            avg_ceil = (s_sec + n_days - 1) // n_days
            max_daily_cap = max(avg_ceil, min(p_max, max(4, avg_ceil + 1)))

            for d in days:
                periods = sorted({t.period for t in slots if t.day_of_week == d})
                d_vars = []
                for p in periods:
                    t = slot_at.get((d, p))
                    if t is not None:
                        p_vars = [built.slot_of[(si, t)] for si in sec_student_sis if (si, t) in built.slot_of]
                        d_vars.extend(p_vars)
                if d_vars:
                    model.Add(sum(d_vars) <= max_daily_cap)


def _add_soft_constraints(model, built: _BuiltModel, req: GenerateRequest, slots) -> None:
    sessions = built.sessions
    if not sessions:
        return
    w: Weights = req.weights
    scale = 100
    w_gap = int(round(w.gap * scale))
    w_spread = int(round(w.spread * scale))
    w_load = int(round(w.load * scale))

    # slot lookup: (day, period) -> slot index
    slot_at = {(t.day_of_week, t.period): i for i, t in enumerate(slots)}
    days = sorted({t.day_of_week for t in slots})

    # occupied[section_id][day][period] as bool == any session active there
    sections = sorted({s.section_id for s in sessions})
    occupied: dict[tuple[str, int, int], object] = {}
    for sec in sections:
        for d in days:
            periods = sorted({t.period for t in slots if t.day_of_week == d})
            for p in periods:
                t = slot_at[(d, p)]
                vars_ = [
                    built.slot_of[(si, t)]
                    for si, s in enumerate(sessions)
                    if s.section_id == sec and (si, t) in built.slot_of
                ]
                occ = model.NewBoolVar(f"occ_{sec}_{d}_{p}")
                if vars_:
                    model.AddMaxEquality(occ, vars_)
                else:
                    model.Add(occ == 0)
                occupied[(sec, d, p)] = occ

    # Reward section active days: encourage spreading classes across all available weekdays
    for sec in sections:
        for d in days:
            periods = sorted({t.period for t in slots if t.day_of_week == d})
            day_occ = [occupied[(sec, d, p)] for p in periods if (sec, d, p) in occupied]
            if day_occ:
                sec_day_used = model.NewBoolVar(f"sec_day_used_{sec}_{d}")
                model.AddMaxEquality(sec_day_used, day_occ)
                built.used_days.append(sec_day_used)

    # gaps: single empty period with occupied neighbours
    for sec in sections:
        for d in days:
            periods = sorted({t.period for t in slots if t.day_of_week == d})
            for idx in range(1, len(periods) - 1):
                p_prev, p, p_next = periods[idx - 1], periods[idx], periods[idx + 1]
                if p_next != p + 1 or p != p_prev + 1:
                    continue  # only numerically adjacent periods
                gap = model.NewBoolVar(f"gap_{sec}_{d}_{p}")
                model.Add(
                    gap
                    >= occupied[(sec, d, p_prev)]
                    + occupied[(sec, d, p_next)]
                    - occupied[(sec, d, p)]
                    - 1
                )
                built.gaps.append(gap)

    # day spread: spread each course's sessions across distinct days
    course_sessions: dict[tuple[str, str, Optional[int]], list[int]] = {}
    for si, s in enumerate(sessions):
        course_sessions.setdefault((s.section_id, s.course_id, s.batch), []).append(si)

    for key, sis in course_sessions.items():
        for d in days:
            on_day = [
                built.slot_of[(si, t)]
                for si in sis
                for t, sl in enumerate(slots)
                if sl.day_of_week == d and (si, t) in built.slot_of
            ]
            if not on_day:
                continue
            used = model.NewBoolVar(f"used_{key[0]}_{key[1]}_{key[2]}_{d}")
            for v in on_day:
                model.Add(used >= v)
            built.used_days.append(used)

    # load balance: minimise the maximum faculty load
    max_possible = len(sessions)
    max_load = model.NewIntVar(0, max_possible, "max_load")
    for load in built.fac_load.values():
        model.Add(max_load >= load)
    built.max_load = max_load

    model.Minimize(
        w_gap * sum(built.gaps)
        - w_spread * sum(built.used_days)
        + w_load * max_load
    )


def _solve_built(built: _BuiltModel, time_limit: float):
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit
    solver.parameters.num_search_workers = 8
    status = solver.Solve(built.model)
    return solver, status


def solve(req: GenerateRequest) -> GenerateResponse:
    """Generate a timetable, or explain why the input is infeasible."""
    try:
        built = _build_model(req, frozenset())
    except _InfeasibleNow as e:
        return GenerateResponse(status="infeasible", message=str(e), causes=["input"])
    except ValueError as e:
        return GenerateResponse(status="infeasible", message=str(e), causes=["input"])

    if not built.sessions:
        return GenerateResponse(status="ok", entries=[])

    solver, status = _solve_built(built, req.time_limit_seconds)
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return _response_from_solver(req, built, solver)

    causes = diagnose(req)
    return GenerateResponse(
        status="infeasible",
        message="No feasible timetable exists for the given constraints.",
        causes=causes,
    )


def _response_from_solver(req, built: _BuiltModel, solver) -> GenerateResponse:
    slots = req.time_slots
    faculty = req.faculty
    rooms = req.rooms
    entries: list[TimetableEntry] = []
    for si, s in enumerate(built.sessions):
        t = next(ti for ti in range(len(slots)) if (si, ti) in built.slot_of
                 and solver.Value(built.slot_of[(si, ti)]) == 1)
        r = next(ri for ri in range(len(rooms)) if (si, ri) in built.room_of
                 and solver.Value(built.room_of[(si, ri)]) == 1)
        fi = next(f for f in range(len(faculty)) if (si, f) in built.fac_of
                  and solver.Value(built.fac_of[(si, f)]) == 1)
        entries.append(
            TimetableEntry(
                section_id=s.section_id,
                course_id=s.course_id,
                faculty_id=faculty[fi].id,
                room_id=rooms[r].id,
                time_slot_id=slots[t].id,
                is_elective=s.is_elective,
                batch=s.batch,
            )
        )

    fac_loads = {
        faculty[fi].id: int(solver.Value(load))
        for fi, load in built.fac_load.items()
    }
    violations = {
        "total_gaps": int(sum(solver.Value(g) for g in built.gaps)),
        "course_days_used": int(sum(solver.Value(u) for u in built.used_days)),
        "max_faculty_load": int(solver.Value(built.max_load)),
        "faculty_loads": fac_loads,
        "sessions_scheduled": len(entries),
    }
    return GenerateResponse(status="ok", entries=entries, violations=violations)


def diagnose(req: GenerateRequest) -> list[str]:
    """Name the constraint groups blocking feasibility.

    Relaxes one group at a time; every group whose relaxation restores
    feasibility is reported as a cause.
    """
    groups = [_RELAX_LOADS, _RELAX_ROOMS, _RELAX_QUALIFICATIONS, _RELAX_ELECTIVES]
    causes: list[str] = []
    for g in groups:
        try:
            built = _build_model(req, frozenset({g}))
        except (_InfeasibleNow, ValueError):
            continue
        if not built.sessions:
            continue
        _, status = _solve_built(built, min(req.time_limit_seconds, 15.0))
        if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            causes.append(g)
    return causes or ["unknown"]
