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

from .schemas import GenerateRequest, GenerateResponse, TimetableEntry, Weights

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
        for _ in range(n):
            sessions.append(
                _Session(
                    section_id=sec.id,
                    course_id=crs.id,
                    strength=sec.strength,
                    lab_required=crs.lab_required,
                    is_elective=crs.is_elective,
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
    _add_clash_constraints(model, built, slots, rooms, faculty)

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

    _add_soft_constraints(model, built, req, slots)

    return built


def _add_clash_constraints(model, built: _BuiltModel, slots, rooms, faculty) -> None:
    """No section / room / faculty is in two places in one slot.

    Uses AND variables: use[si,r,t] == room_of[si,r] AND slot_of[si,t].
    """
    sessions = built.sessions
    n_slots = len(slots)
    for t in range(n_slots):
        # section clash
        by_section: dict[str, list] = {}
        for si, s in enumerate(sessions):
            v = built.slot_of.get((si, t))
            if v is not None:
                by_section.setdefault(s.section_id, []).append(v)
        for vars_ in by_section.values():
            model.Add(sum(vars_) <= 1)
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

    # occupied[section_id][day][period] as bool == any session there
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
                    # at most one session per section/slot is already enforced
                    model.Add(occ == sum(vars_))
                else:
                    model.Add(occ == 0)
                occupied[(sec, d, p)] = occ

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

    # day spread: used_day[si, d] >= slot_of[si, t] for t on day d
    for si, s in enumerate(sessions):
        for d in days:
            on_day = [
                built.slot_of[(si, t)]
                for t, sl in enumerate(slots)
                if sl.day_of_week == d and (si, t) in built.slot_of
            ]
            if not on_day:
                continue
            used = model.NewBoolVar(f"used_{si}_{d}")
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
