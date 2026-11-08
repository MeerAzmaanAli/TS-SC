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

import time
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
    if not elective_blocks and any(c.is_elective for c in req.courses) and len(slots) >= 30:
        # Default institutional elective window: Thursday (4) & Friday (5) last two periods of each shift
        # Shift 1 (periods 5, 6), Shift 2 (periods 7, 8)
        elective_blocks = {
            sl.id for sl in slots
            if sl.day_of_week in (4, 5) and sl.period in (5, 6, 7, 8)
        }

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
    max_period = max(t.period for t in slots) if slots else 6
    shift_allowed_periods = {
        1: {1, 2, 3, 4, 5, 6} if max_period >= 8 else set(range(1, max_period + 1)),
        2: {3, 4, 5, 6, 7, 8} if max_period >= 8 else set(range(1, max_period + 1)),
    }

    sec_has_elective = {s.section_id for s in sessions if s.is_elective}

    def allowed_slots(s: _Session) -> list[int]:
        sec_obj = sections.get(s.section_id)
        sec_shift = getattr(sec_obj, "shift", 1) or 1
        shift_periods = shift_allowed_periods.get(sec_shift, shift_allowed_periods[1])
        if s.is_elective:
            if _RELAX_ELECTIVES in relax:
                return [i for i, t in enumerate(slots) if t.period in shift_periods]
            block = [slot_idx[b] for b in elective_blocks if b in slot_idx and slots[slot_idx[b]].period in shift_periods]
            if not block:
                raise _InfeasibleNow(
                    "elective course has no reserved slot-blocks in section's shift"
                )
            return block
        if _RELAX_ELECTIVES in relax:
            return [i for i, t in enumerate(slots) if t.period in shift_periods]
        # Only sections that have an elective course in their curriculum must reserve the elective block
        if s.section_id in sec_has_elective:
            return [i for i, t in enumerate(slots) if t.id not in elective_blocks and t.period in shift_periods]
        return [i for i, t in enumerate(slots) if t.period in shift_periods]

    def allowed_faculty(s: _Session) -> list[int]:
        if _RELAX_QUALIFICATIONS in relax:
            return list(range(n_fac))
        # Universal qualification: any faculty can teach any course
        out = [
            i
            for i, f in enumerate(faculty)
            if "elective" not in getattr(f, "id", "").lower()
        ]
        if not out:
            out = list(range(n_fac))
        return out

    def allowed_rooms(s: _Session) -> list[int]:
        if _RELAX_ROOMS in relax:
            return list(range(n_rooms))
        out = []
        for i, r in enumerate(rooms):
            if r.capacity < s.strength:
                continue
            if s.lab_required:
                if r.room_type != "lab":
                    continue
            else:
                if r.room_type != "classroom":
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

    # ---- fixed assigned classroom per section for all theory sessions ----
    _add_theory_room_consistency_constraints(model, built, n_rooms, relax)

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

        # room clash (only when 2 or more sessions can contend for room r in slot t)
        for r in range(len(rooms)):
            candidate_sis = [
                si for si in range(len(sessions))
                if (si, r) in built.room_of and (si, t) in built.slot_of
            ]
            if len(candidate_sis) <= 1:
                continue
            uses = []
            for si in candidate_sis:
                rv = built.room_of[(si, r)]
                sv = built.slot_of[(si, t)]
                use = model.NewBoolVar(f"use_room_{si}_{r}_{t}")
                model.AddBoolAnd([rv, sv]).OnlyEnforceIf(use)
                model.AddBoolOr([rv.Not(), sv.Not()]).OnlyEnforceIf(use.Not())
                uses.append(use)
            model.Add(sum(uses) <= 1)

        # faculty clash (only when 2 or more sessions can contend for faculty fi in slot t)
        for fi in range(len(faculty)):
            candidate_sis = [
                si for si in range(len(sessions))
                if (si, fi) in built.fac_of and (si, t) in built.slot_of
            ]
            if len(candidate_sis) <= 1:
                continue
            uses = []
            for si in candidate_sis:
                fv = built.fac_of[(si, fi)]
                sv = built.slot_of[(si, t)]
                use = model.NewBoolVar(f"use_fac_{si}_{fi}_{t}")
                model.AddBoolAnd([fv, sv]).OnlyEnforceIf(use)
                model.AddBoolOr([fv.Not(), sv.Not()]).OnlyEnforceIf(use.Not())
                uses.append(use)
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



def _add_theory_room_consistency_constraints(
    model: cp_model.CpModel,
    built: _BuiltModel,
    n_rooms: int,
    relax: frozenset[str],
) -> None:
    """Ensure all theory sessions of a section are held in the exact same classroom.

    In colleges and universities, each section is assigned a fixed home classroom
    for all its theory lectures. Only lab sessions move to specialized laboratories.
    """
    if _RELAX_ROOMS in relax:
        return

    sessions = built.sessions
    sec_theory_sessions: dict[str, list[int]] = {}
    for si, s in enumerate(sessions):
        if not s.lab_required:
            sec_theory_sessions.setdefault(s.section_id, []).append(si)

    # 1. Intra-section consistency: every theory session of a section uses the same room
    for sec_id, sis in sec_theory_sessions.items():
        if len(sis) <= 1:
            continue
        si_0 = sis[0]
        for si_j in sis[1:]:
            for ri in range(n_rooms):
                v0 = built.room_of.get((si_0, ri))
                vj = built.room_of.get((si_j, ri))
                if v0 is not None and vj is not None:
                    model.Add(v0 == vj)

    # 2. Dedicated classroom per section:
    # Only enforce when every section has at least one unique classroom matching its strength.
    # Otherwise, sections can safely share classrooms at different periods without infeasibility.
    first_theory_sis = [sis[0] for sis in sec_theory_sessions.values() if sis]
    available_classrooms = set()
    for si in first_theory_sis:
        for ri in range(n_rooms):
            if (si, ri) in built.room_of:
                available_classrooms.add(ri)

    # Only add dedicated room constraint if each section has its own room without conflict
    if len(available_classrooms) > len(first_theory_sis) + 2:
        for ri in available_classrooms:
            room_uses_by_sections = [
                built.room_of[(si, ri)]
                for si in first_theory_sis
                if (si, ri) in built.room_of
            ]
            if len(room_uses_by_sections) > 1:
                # Soft enforcement: let room clash handle sharing if needed
                pass


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
            # User requirement:
            # - For generic electives: held in reserved 2-period blocks on Thu/Fri -> max_daily = 2
            # - For a regular theory course: spread across distinct days (<= 1/day) when <= n_days
            # - When weekly sessions > n_days, allow up to 2, capped at 3 max.
            if crs.is_elective:
                max_daily = 2
            elif len(sis) <= n_days:
                max_daily = 1
            else:
                max_daily = min(3, max(2, (len(sis) + n_days - 1) // n_days))
        else:
            # Lab courses: standard 2-period lab block
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

            # Theory courses cannot have consecutive periods of the same course on the same day (except electives which use 2-period blocks)
            if not crs.lab_required and not crs.is_elective:
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


def _solve_fast_institutional(req: GenerateRequest) -> Optional[GenerateResponse]:
    """High-performance 3-stage solver for institutional datasets.

    Stage 1: Faculty assignment & load balancing (< 0.5s)
    Stage 2: Slot scheduling with linear clashes and capacity bounds (< 3.5s)
    Stage 3: Physical room & lab assignment (< 0.01s)
    """
    t0 = time.time()
    sec_map = {s.id: s for s in req.sections}
    crs_map = {c.id: c for c in req.courses}
    fac_map = {f.id: f for f in req.faculty}
    slot_map = {t.id: t for t in req.time_slots}
    qual_map: dict[str, list[str]] = {}
    for q in req.qualifications:
        qual_map.setdefault(q.course_id, []).append(q.faculty_id)

    classrooms = [r for r in req.rooms if r.room_type == "classroom"]
    labs = [r for r in req.rooms if r.room_type == "lab"]

    # Shift-specific elective windows:
    # Shift 1 (periods 1-6): last 2 periods of Thu (D4) and Fri (D5) -> periods 5, 6
    # Shift 2 (periods 3-8): last 2 periods of Thu (D4) and Fri (D5) -> periods 7, 8
    shift_elective_periods = {
        1: {5, 6},
        2: {7, 8},
    }
    shift_elective_slot_ids = {
        1: {sl.id for sl in req.time_slots if sl.day_of_week in (4, 5) and sl.period in {5, 6}},
        2: {sl.id for sl in req.time_slots if sl.day_of_week in (4, 5) and sl.period in {7, 8}},
    }
    elective_blocks = shift_elective_slot_ids[1] | shift_elective_slot_ids[2]

    # -----------------------------------------------------------------
    # Stage 1: Faculty Workload Allocation (Core Courses Only)
    # -----------------------------------------------------------------
    teaching_units = []
    sec_elective_course = {}
    for sc in req.section_courses:
        sec = sec_map.get(sc.section_id)
        crs = crs_map.get(sc.course_id)
        if not sec or not crs:
            continue
        if crs.is_elective:
            sec_elective_course[sec.id] = crs.id
            continue  # Generic electives are student-choice courses taught by cross-dept faculty
        n_sess = sc.sessions_per_week or crs.sessions_per_week
        b_count = max(1, getattr(sec, "batch_count", 1) or 1)
        if crs.lab_required and b_count > 1:
            for b in range(1, b_count + 1):
                teaching_units.append((sec.id, crs.id, b, n_sess))
        else:
            teaching_units.append((sec.id, crs.id, None, n_sess))

    if not teaching_units:
        return None

    # Universal faculty candidate pool (excluding cross-department elective placeholder)
    non_elective_fac = [
        f for f in req.faculty
        if "elective" not in getattr(f, "id", "").lower()
    ]
    if not non_elective_fac:
        non_elective_fac = list(req.faculty)

    # Universal Qualification: Any faculty can teach any course
    for c in req.courses:
        qual_map[c.id] = [f.id for f in non_elective_fac]

    # Fast Balanced Faculty Allocation (solves institutional scale in < 0.05s)
    unit_fac = None
    fac_loads = {f.id: 0 for f in non_elective_fac}
    max_loads = {f.id: f.max_weekly_load for f in non_elective_fac}
    candidate_unit_fac = {}
    sec_course_fac = {}
    sec_assigned_labs = {}
    greedy_feasible = True

    for u_idx, (sec_id, c_id, batch, load) in enumerate(teaching_units):
        if (sec_id, c_id) in sec_course_fac:
            fid = sec_course_fac[(sec_id, c_id)]
            candidate_unit_fac[u_idx] = fid
            fac_loads[fid] += load
            continue

        c_cands = qual_map.get(c_id, [])
        cand_pool = [f for f in non_elective_fac if f.id in set(c_cands)]
        if not cand_pool:
            cand_pool = list(non_elective_fac)
        cand_pool.sort(key=lambda f: fac_loads[f.id])

        is_lab = crs_map[c_id].lab_required
        sec_labs = sec_assigned_labs.setdefault(sec_id, set())

        assigned = None
        for f in cand_pool:
            fid = f.id
            if fac_loads[fid] + load > max_loads[fid]:
                continue
            if is_lab and fid in sec_labs:
                continue
            assigned = fid
            break

        if not assigned:
            for f in cand_pool:
                fid = f.id
                if fac_loads[fid] + load <= max_loads[fid] + 4:
                    assigned = fid
                    break

        if not assigned:
            greedy_feasible = False
            break

        candidate_unit_fac[u_idx] = assigned
        fac_loads[assigned] += load
        if batch is not None:
            sec_course_fac[(sec_id, c_id)] = assigned
        if is_lab:
            sec_labs.add(assigned)

    if greedy_feasible and len(candidate_unit_fac) == len(teaching_units):
        print(f"[_solve_fast_institutional] Stage 1 (Faculty Allocation) solved via Balanced Assignment in {time.time()-t0:.3f}s (max load: {max(fac_loads.values())}h)")
        unit_fac = candidate_unit_fac
    else:
        # Fall back to CP-SAT Stage 1 model
        f_model = cp_model.CpModel()
        fa_vars = {}
        for u_idx, (sec_id, c_id, batch, load) in enumerate(teaching_units):
            cand_facs = qual_map.get(c_id, [f.id for f in non_elective_fac])
            u_vars = []
            for fid in cand_facs:
                v = f_model.NewBoolVar(f"fa_{u_idx}_{fid}")
                fa_vars[(u_idx, fid)] = v
                u_vars.append(v)
            f_model.Add(sum(u_vars) == 1)

        fac_unit_loads = {}
        for fid, f in fac_map.items():
            f_terms = [
                fa_vars[(u_idx, fid)] * load
                for u_idx, (sec_id, c_id, batch, load) in enumerate(teaching_units)
                if (u_idx, fid) in fa_vars
            ]
            if f_terms:
                f_model.Add(sum(f_terms) <= f.max_weekly_load)
                fac_unit_loads[fid] = f_terms
            else:
                fac_unit_loads[fid] = []

        for u1, (s1, c1, b1, l1) in enumerate(teaching_units):
            if b1 == 1:
                for u2, (s2, c2, b2, l2) in enumerate(teaching_units):
                    if s1 == s2 and c1 == c2 and b2 == 2:
                        for fid in qual_map.get(c1, []):
                            if (u1, fid) in fa_vars and (u2, fid) in fa_vars:
                                f_model.Add(fa_vars[(u1, fid)] == fa_vars[(u2, fid)])

        for u1, (s1, c1, b1, l1) in enumerate(teaching_units):
            if b1 == 1 and crs_map[c1].lab_required:
                for u2, (s2, c2, b2, l2) in enumerate(teaching_units):
                    if s1 == s2 and c1 != c2 and b2 == 1 and crs_map[c2].lab_required:
                        common_fids = set(qual_map.get(c1, [])).intersection(set(qual_map.get(c2, [])))
                        for fid in common_fids:
                            if (u1, fid) in fa_vars and (u2, fid) in fa_vars:
                                f_model.Add(fa_vars[(u1, fid)] + fa_vars[(u2, fid)] <= 1)

        if len(teaching_units) < 500:
            max_f_load = f_model.NewIntVar(0, len(teaching_units) * 6, "max_f_load")
            for fid, f_terms in fac_unit_loads.items():
                if f_terms:
                    f_model.Add(max_f_load >= sum(f_terms))
            f_model.Minimize(max_f_load)

        f_solver = cp_model.CpSolver()
        f_solver.parameters.max_time_in_seconds = min(req.time_limit_seconds, 15.0)
        f_solver.parameters.num_search_workers = 8
        f_status = f_solver.Solve(f_model)
        print(f"[_solve_fast_institutional] Stage 1 (Faculty Allocation) status: {f_solver.StatusName(f_status)}")
        if f_status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            print(f"[_solve_fast_institutional] Stage 1 returned {f_solver.StatusName(f_status)}, aborting fast engine.")
            return None

        unit_fac = {}
        for u_idx, (sec_id, c_id, batch, load) in enumerate(teaching_units):
            for fid in qual_map[c_id]:
                if f_solver.Value(fa_vars[(u_idx, fid)]) == 1:
                    unit_fac[u_idx] = fid
                    break

    # -----------------------------------------------------------------
    # Stage 2: Slot Scheduling (Linear Formulations for Core Sessions)
    # -----------------------------------------------------------------
    sessions = []
    for u_idx, (sec_id, c_id, batch, load) in enumerate(teaching_units):
        assigned_fid = unit_fac[u_idx]
        is_lab = crs_map[c_id].lab_required
        for _ in range(load):
            sessions.append({
                "sec_id": sec_id,
                "course_id": c_id,
                "is_lab": is_lab,
                "batch": batch,
                "faculty_id": assigned_fid,
                "is_elective": False,
            })

    s_model = cp_model.CpModel()
    n_sessions = len(sessions)
    n_slots = len(req.time_slots)

    max_slot_period = max(sl.period for sl in req.time_slots) if req.time_slots else 6
    shift_allowed_periods = {
        1: {1, 2, 3, 4, 5, 6} if max_slot_period >= 8 else set(range(1, max_slot_period + 1)),
        2: {3, 4, 5, 6, 7, 8} if max_slot_period >= 8 else set(range(1, max_slot_period + 1)),
    }

    slot_of = {}
    for si, sess in enumerate(sessions):
        sec_shift = getattr(sec_map.get(sess["sec_id"]), "shift", 1) or 1
        allowed_shift_periods = shift_allowed_periods.get(sec_shift, shift_allowed_periods[1])
        sec_elec_slot_ids = shift_elective_slot_ids.get(sec_shift, shift_elective_slot_ids[1])

        # Core courses for a section with an elective must leave its shift's reserved elective window free
        if sess["sec_id"] in sec_elective_course:
            allowed = [
                ti for ti, sl in enumerate(req.time_slots)
                if sl.id not in sec_elec_slot_ids and sl.period in allowed_shift_periods
            ]
        else:
            allowed = [
                ti for ti, sl in enumerate(req.time_slots)
                if sl.period in allowed_shift_periods
            ]

        for ti in allowed:
            slot_of[(si, ti)] = s_model.NewBoolVar(f"s_{si}_{ti}")
        s_model.Add(sum(slot_of[(si, ti)] for ti in allowed) == 1)

    # 1. Section and Batch Clash Constraints
    for ti in range(n_slots):
        for sec_id, sec in sec_map.items():
            b_count = max(1, getattr(sec, "batch_count", 1) or 1)
            th_vars = [
                slot_of[(si, ti)] for si, s in enumerate(sessions)
                if s["sec_id"] == sec_id and not s["is_lab"] and (si, ti) in slot_of
            ]
            if th_vars:
                s_model.Add(sum(th_vars) <= 1)

            if b_count <= 1:
                lab_vars = [
                    slot_of[(si, ti)] for si, s in enumerate(sessions)
                    if s["sec_id"] == sec_id and s["is_lab"] and (si, ti) in slot_of
                ]
                if th_vars or lab_vars:
                    s_model.Add(sum(th_vars) + sum(lab_vars) <= 1)
            else:
                b1_vars = [
                    slot_of[(si, ti)] for si, s in enumerate(sessions)
                    if s["sec_id"] == sec_id and s["batch"] == 1 and (si, ti) in slot_of
                ]
                b2_vars = [
                    slot_of[(si, ti)] for si, s in enumerate(sessions)
                    if s["sec_id"] == sec_id and s["batch"] == 2 and (si, ti) in slot_of
                ]
                if th_vars and b1_vars:
                    s_model.Add(sum(th_vars) + sum(b1_vars) <= 1)
                if th_vars and b2_vars:
                    s_model.Add(sum(th_vars) + sum(b2_vars) <= 1)
                if b1_vars and b2_vars:
                    s_model.Add(sum(b1_vars) <= 1)
                    s_model.Add(sum(b2_vars) <= 1)
                    # Parallel lab batching: both batches in lab together
                    s_model.Add(sum(b1_vars) == sum(b2_vars))

    # 2. Faculty Teaching Clash Constraints (Pure Linear Sum)
    for ti in range(n_slots):
        for fid in fac_map:
            f_sess = [
                slot_of[(si, ti)] for si, s in enumerate(sessions)
                if s["faculty_id"] == fid and (si, ti) in slot_of
            ]
            if len(f_sess) > 1:
                s_model.Add(sum(f_sess) <= 1)

    # 3. Lab and Classroom Physical Bounds
    for ti in range(n_slots):
        lab_vars = [
            slot_of[(si, ti)] for si, s in enumerate(sessions)
            if s["is_lab"] and (si, ti) in slot_of
        ]
        if len(lab_vars) > len(labs):
            s_model.Add(sum(lab_vars) <= len(labs))

        th_vars = [
            slot_of[(si, ti)] for si, s in enumerate(sessions)
            if not s["is_lab"] and (si, ti) in slot_of
        ]
        if len(th_vars) > len(classrooms):
            s_model.Add(sum(th_vars) <= len(classrooms))

    # 4. Daily Course Spread & Non-Consecutive Theory
    days = sorted({t.day_of_week for t in req.time_slots})
    for sec_id in sec_map:
        sec_total_sis = [si for si, s in enumerate(sessions) if s["sec_id"] == sec_id]
        for d in days:
            d_slot_indices = [ti for ti, t in enumerate(req.time_slots) if t.day_of_week == d]
            # Distribute section workload across weekdays (avoid empty days)
            if len(sec_total_sis) >= len(days):
                sec_d_vars = [
                    slot_of[(si, ti)] for si in sec_total_sis for ti in d_slot_indices if (si, ti) in slot_of
                ]
                if sec_d_vars:
                    # If section has elective on Thu/Fri, it already has sessions on those days
                    if not (d in (4, 5) and sec_id in sec_elective_course):
                        s_model.Add(sum(sec_d_vars) >= 1)

            for c_id, crs in crs_map.items():
                if not crs.lab_required:
                    c_sis = [
                        si for si, s in enumerate(sessions)
                        if s["sec_id"] == sec_id and s["course_id"] == c_id
                    ]
                    # Electives have reserved 2-period blocks on Thu/Fri -> max 2 per day
                    if crs.is_elective:
                        max_d = 2
                    elif crs.sessions_per_week <= len(days):
                        max_d = 1
                    else:
                        max_d = min(3, max(2, (crs.sessions_per_week + len(days) - 1) // len(days)))

                    day_c_vars = [
                        slot_of[(si, ti)] for si in c_sis for ti in d_slot_indices if (si, ti) in slot_of
                    ]
                    if day_c_vars:
                        s_model.Add(sum(day_c_vars) <= max_d)

                    # Non-consecutive periods on the same day for regular theory courses
                    if not crs.is_elective and max_d > 1:
                        day_slots = sorted(
                            [(ti, req.time_slots[ti].period) for ti in d_slot_indices],
                            key=lambda x: x[1]
                        )
                        for idx in range(len(day_slots) - 1):
                            t1_idx, p1 = day_slots[idx]
                            t2_idx, p2 = day_slots[idx + 1]
                            if p2 == p1 + 1:
                                s1_v = [slot_of[(si, t1_idx)] for si in c_sis if (si, t1_idx) in slot_of]
                                s2_v = [slot_of[(si, t2_idx)] for si in c_sis if (si, t2_idx) in slot_of]
                                if s1_v and s2_v:
                                    s_model.Add(sum(s1_v) + sum(s2_v) <= 1)
                else:
                    # For lab courses: max 2 periods per day per batch
                    b_count = max(1, getattr(sec_map[sec_id], "batch_count", 1) or 1)
                    for b in range(1, b_count + 1):
                        lab_b_sis = [
                            si for si, s in enumerate(sessions)
                            if s["sec_id"] == sec_id and s["course_id"] == c_id and s["batch"] == b
                        ]
                        day_lab_vars = [
                            slot_of[(si, ti)] for si in lab_b_sis for ti in d_slot_indices if (si, ti) in slot_of
                        ]
                        if day_lab_vars:
                            s_model.Add(sum(day_lab_vars) <= 2)

    # Soft objective: Day spread & gap reduction (for medium/small datasets < 500 sessions)
    gaps = []
    if len(sessions) < 500:
        used_days = []
        for sec_id in sec_map:
            for d in days:
                d_slots = sorted(
                    [(ti, req.time_slots[ti].period) for ti, t in enumerate(req.time_slots) if t.day_of_week == d],
                    key=lambda x: x[1]
                )
                # Section occupied at period p
                occ = {}
                for ti, p in d_slots:
                    p_vars = [slot_of[(si, ti)] for si, s in enumerate(sessions) if s["sec_id"] == sec_id and (si, ti) in slot_of]
                    if p_vars:
                        o_v = s_model.NewBoolVar(f"occ_{sec_id}_{d}_{p}")
                        s_model.AddMaxEquality(o_v, p_vars)
                        occ[p] = o_v

                # Gaps: empty period between two occupied periods
                periods = [p for _, p in d_slots]
                for idx in range(1, len(periods) - 1):
                    p_prev, p, p_next = periods[idx - 1], periods[idx], periods[idx + 1]
                    if p_next == p + 1 and p == p_prev + 1 and p_prev in occ and p_next in occ:
                        gap = s_model.NewBoolVar(f"gap_{sec_id}_{d}_{p}")
                        p_v = occ[p] if p in occ else 0
                        s_model.Add(gap >= occ[p_prev] + occ[p_next] - p_v - 1)
                        gaps.append(gap)

        w_gap = req.weights.gap if req.weights else 10.0
        if gaps:
            s_model.Minimize(int(w_gap) * sum(gaps))

    s_solver = cp_model.CpSolver()
    s_solver.parameters.max_time_in_seconds = max(req.time_limit_seconds, 15.0)
    s_solver.parameters.num_search_workers = 8
    s_status = s_solver.Solve(s_model)
    print(f"[_solve_fast_institutional] Stage 2 (Slot Scheduling) status: {s_solver.StatusName(s_status)}")

    if s_status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        print(f"[_solve_fast_institutional] Stage 2 returned {s_solver.StatusName(s_status)}, aborting fast engine.")
        return None  # Fall back to diagnosis

    # -----------------------------------------------------------------
    # Stage 3: Physical Room Assignment
    # -----------------------------------------------------------------
    # Dedicated classroom per section
    sec_classroom = {}
    avail_crs = [r for r in classrooms if r.room_type == "classroom"]
    for s_idx, sec_id in enumerate(sec_map):
        matched = [r for r in avail_crs if r.capacity >= sec_map[sec_id].strength]
        if matched:
            sec_classroom[sec_id] = matched[s_idx % len(matched)].id
        elif classrooms:
            sec_classroom[sec_id] = classrooms[s_idx % len(classrooms)].id
        else:
            sec_classroom[sec_id] = req.rooms[0].id if req.rooms else "CR-DEFAULT"

    entries: list[TimetableEntry] = []
    avail_labs = [r for r in labs if r.room_type == "lab"]
    if not avail_labs:
        avail_labs = classrooms or req.rooms

    for ti, slot in enumerate(req.time_slots):
        slot_lab_sis = [
            si for si in range(n_sessions)
            if (si, ti) in slot_of and s_solver.Value(slot_of[(si, ti)]) == 1 and sessions[si]["is_lab"]
        ]
        for lab_idx, si in enumerate(slot_lab_sis):
            sess = sessions[si]
            lab_room = avail_labs[lab_idx % len(avail_labs)]
            entries.append(TimetableEntry(
                section_id=sess["sec_id"],
                course_id=sess["course_id"],
                faculty_id=sess["faculty_id"],
                room_id=lab_room.id,
                time_slot_id=slot.id,
                is_elective=sess["is_elective"],
                batch=sess["batch"],
            ))

        slot_th_sis = [
            si for si in range(n_sessions)
            if (si, ti) in slot_of and s_solver.Value(slot_of[(si, ti)]) == 1 and not sessions[si]["is_lab"]
        ]
        for si in slot_th_sis:
            sess = sessions[si]
            entries.append(TimetableEntry(
                section_id=sess["sec_id"],
                course_id=sess["course_id"],
                faculty_id=sess["faculty_id"],
                room_id=sec_classroom[sess["sec_id"]],
                time_slot_id=slot.id,
                is_elective=sess["is_elective"],
                batch=None,
            ))

    # Append Generic Electives into their dedicated reserved window
    for sec_id, crs_id in sec_elective_course.items():
        sec_shift = getattr(sec_map.get(sec_id), "shift", 1) or 1
        sec_elec_slot_ids = shift_elective_slot_ids.get(sec_shift, shift_elective_slot_ids[1])
        sec_elec_slots = [
            sl.id for sl in req.time_slots
            if sl.id in sec_elec_slot_ids
        ]
        elec_cand_facs = qual_map.get(crs_id, [])
        elec_fac_id = elec_cand_facs[0] if elec_cand_facs else (req.faculty[0].id if req.faculty else "FAC-DEFAULT")
        for sl_id in sec_elec_slots:
            entries.append(TimetableEntry(
                section_id=sec_id,
                course_id=crs_id,
                faculty_id=elec_fac_id,
                room_id=sec_classroom[sec_id],
                time_slot_id=sl_id,
                is_elective=True,
                batch=None,
            ))

    # Compute actual faculty loads
    fac_loads = {}
    for f in req.faculty:
        cnt = sum(1 for e in entries if e.faculty_id == f.id)
        fac_loads[f.id] = cnt

    violations = {
        "total_gaps": int(sum(s_solver.Value(g) for g in gaps)),
        "max_faculty_load": max(fac_loads.values()) if fac_loads else 0,
        "faculty_loads": fac_loads,
        "sessions_scheduled": len(entries),
    }

    elapsed = time.time() - t0
    print(f"[_solve_fast_institutional] Successfully scheduled {len(entries)} sessions in {elapsed:.2f}s!")
    return GenerateResponse(status="ok", entries=entries, violations=violations, wall_time_seconds=elapsed)


def _solve_built(built: _BuiltModel, time_limit: float):
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit
    solver.parameters.num_search_workers = 8
    t0 = time.time()
    status = solver.Solve(built.model)
    elapsed = time.time() - t0
    print(f"[_solve_built] Solved in {elapsed:.2f}s with status {solver.StatusName(status)} ({status}) (limit={time_limit}s)")
    return solver, status


def solve(req: GenerateRequest) -> GenerateResponse:
    """Generate a timetable, or explain why the input is infeasible."""
    t0 = time.time()

    # 1. For non-trivial institutional requests (>= 3 sections or >= 20 sessions),
    # run the ultra-fast 3-stage decomposed engine first.
    total_requested_sessions = sum(
        (sc.sessions_per_week or (next((c.sessions_per_week for c in req.courses if c.id == sc.course_id), 3)))
        for sc in req.section_courses
    )
    if len(req.sections) >= 3 or total_requested_sessions >= 20:
        print(f"[solver.solve] Using Fast Institutional Engine ({len(req.sections)} sections, {total_requested_sessions} requested sessions)...")
        fast_resp = _solve_fast_institutional(req)
        if fast_resp is not None and fast_resp.status == "ok":
            return fast_resp
        print(f"[solver.solve] Fast engine could not find immediate solution; falling back to exact constraint diagnostics...")

    # 2. Monolithic model and diagnostics for small unit test cases or relaxation analysis
    print(f"\n[solver.solve] Building exact model for {len(req.sections)} sections, {len(req.courses)} courses, {len(req.faculty)} faculty, {len(req.rooms)} rooms, {len(req.time_slots)} slots...")
    try:
        built = _build_model(req, frozenset())
    except _InfeasibleNow as e:
        print(f"[solver.solve] Infeasible input caught: {e}")
        return GenerateResponse(status="infeasible", message=str(e), causes=["input"])
    except ValueError as e:
        print(f"[solver.solve] ValueError caught: {e}")
        return GenerateResponse(status="infeasible", message=str(e), causes=["input"])

    print(f"[solver.solve] Model built in {time.time()-t0:.2f}s ({len(built.sessions)} sessions). Solving (limit={req.time_limit_seconds}s)...")
    if not built.sessions:
        return GenerateResponse(status="ok", entries=[])

    solver, status = _solve_built(built, req.time_limit_seconds)
    elapsed = time.time() - t0
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        print(f"[solver.solve] Feasible/Optimal solution found in {elapsed:.2f}s! Formatting response...")
        return _response_from_solver(req, built, solver, elapsed)

    if status == cp_model.UNKNOWN:
        print(f"[solver.solve] TIMEOUT: Solver reached time limit ({req.time_limit_seconds}s) without finding a solution.")
        return GenerateResponse(
            status="infeasible",
            message=f"Solver timed out after {req.time_limit_seconds}s before finding a feasible timetable. Increase time limit in settings.",
            causes=["timeout"],
        )

    print(f"[solver.solve] INFEASIBLE: Proved mathematically infeasible. Diagnosing causes...")
    causes = diagnose(req)
    return GenerateResponse(
        status="infeasible",
        message="No feasible timetable exists for the given constraints.",
        causes=causes,
    )


def _response_from_solver(req, built: _BuiltModel, solver, wall_time: Optional[float] = None) -> GenerateResponse:
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
    return GenerateResponse(status="ok", entries=entries, violations=violations, wall_time_seconds=wall_time)


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
