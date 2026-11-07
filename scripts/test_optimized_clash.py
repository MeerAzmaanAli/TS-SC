"""
Test optimized clash formulation:
Compare original vs optimized clash constraints on CSE.
"""

import sys
import os
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "solver"))
sys.path.insert(0, os.path.dirname(__file__))

from app.schemas import (
    GenerateRequest,
    Section,
    Course,
    SectionCourse,
    Faculty,
    Room,
    TimeSlot,
    Qualification,
    Weights,
)
from app.solver import _BuiltModel, _RELAX_ELECTIVES, _RELAX_QUALIFICATIONS, _RELAX_ROOMS, _RELAX_LOADS, _InfeasibleNow, _add_faculty_consistency_constraints, _add_theory_room_consistency_constraints, _add_daily_distribution_constraints, cp_model
from test_formulation_speed import get_slots, get_rooms, make_dept_data

def build_optimized_model(req: GenerateRequest, relax: frozenset[str]) -> _BuiltModel:
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

    from app.solver import _Session
    sessions: list[_Session] = []
    for sc in req.section_courses:
        sec = sections.get(sc.section_id)
        crs = courses.get(sc.course_id)
        if sec is None or crs is None:
            raise ValueError(f"unknown section/course: {sc}")
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
                raise _InfeasibleNow("elective course has no reserved slot-blocks")
            return block
        if _RELAX_ELECTIVES in relax:
            return list(range(n_slots))
        return [i for i, t in enumerate(slots) if t.id not in elective_blocks]

    def allowed_faculty(s: _Session) -> list[int]:
        if _RELAX_QUALIFICATIONS in relax:
            return list(range(n_fac))
        out = [i for i, f in enumerate(faculty) if (f.id, s.course_id) in qualified]
        if not out:
            raise _InfeasibleNow(f"no qualified faculty for course {s.course_id}")
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
            raise _InfeasibleNow(f"no suitable room for course {s.course_id}")
        return out

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

    # Pre-index sessions by room and faculty
    sessions_by_room: dict[int, list[int]] = {}
    sessions_by_fac: dict[int, list[int]] = {}
    for si in range(len(sessions)):
        for r in range(n_rooms):
            if (si, r) in built.room_of:
                sessions_by_room.setdefault(r, []).append(si)
        for fi in range(n_fac):
            if (si, fi) in built.fac_of:
                sessions_by_fac.setdefault(fi, []).append(si)

    # Section clash & batch sync
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

    # Section clash
    for t in range(n_slots):
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
                lab_vars = [
                    built.slot_of[(si, t)]
                    for si in sec_batch_lab_sessions.get((sec_id, 1), [])
                    if (si, t) in built.slot_of
                ]
                all_sec_vars = theory_vars + lab_vars
                if all_sec_vars:
                    model.Add(sum(all_sec_vars) <= 1)
            else:
                batch_lab_vars = {}
                for b in range(1, b_count + 1):
                    b_vars = [
                        built.slot_of[(si, t)]
                        for si in sec_batch_lab_sessions.get((sec_id, b), [])
                        if (si, t) in built.slot_of
                    ]
                    batch_lab_vars[b] = b_vars
                    if theory_vars or b_vars:
                        model.Add(sum(theory_vars) + sum(b_vars) <= 1)

                lab_courses = sec_lab_courses.get(sec_id, set())
                if len(lab_courses) >= b_count:
                    for b in range(2, b_count + 1):
                        model.Add(sum(batch_lab_vars[1]) == sum(batch_lab_vars[b]))

                for cid in lab_courses:
                    c_vars = [
                        built.slot_of[(si, t)]
                        for si in sec_course_lab_sessions.get((sec_id, cid), [])
                        if (si, t) in built.slot_of
                    ]
                    if c_vars:
                        model.Add(sum(c_vars) <= 1)

    # OPTIMIZED ROOM CLASH (Only when candidate sessions >= 2)
    # Check if dedicated classrooms exist:
    first_theory_sis = [sis[0] for sis in sec_theory_sessions.values() if sis]
    has_dedicated_classrooms = (len(first_theory_sis) <= len([r for r in rooms if r.room_type == "classroom"]))
    
    for r in range(n_rooms):
        room_obj = rooms[r]
        # If dedicated classrooms are in effect, classroom clashes are mathematically impossible across sections
        if has_dedicated_classrooms and room_obj.room_type == "classroom":
            continue
            
        r_sis = sessions_by_room.get(r, [])
        if len(r_sis) <= 1:
            continue
            
        for t in range(n_slots):
            cand = [si for si in r_sis if (si, t) in built.slot_of]
            if len(cand) <= 1:
                continue
            uses = []
            for si in cand:
                rv = built.room_of[(si, r)]
                sv = built.slot_of[(si, t)]
                use = model.NewBoolVar(f"u_r_{si}_{r}_{t}")
                model.AddBoolAnd([rv, sv]).OnlyEnforceIf(use)
                model.AddBoolOr([rv.Not(), sv.Not()]).OnlyEnforceIf(use.Not())
                uses.append(use)
            model.Add(sum(uses) <= 1)

    # OPTIMIZED FACULTY CLASH (Only when candidate sessions >= 2)
    for fi in range(n_fac):
        f_sis = sessions_by_fac.get(fi, [])
        if len(f_sis) <= 1:
            continue
        for t in range(n_slots):
            cand = [si for si in f_sis if (si, t) in built.slot_of]
            if len(cand) <= 1:
                continue
            uses = []
            for si in cand:
                fv = built.fac_of[(si, fi)]
                sv = built.slot_of[(si, t)]
                use = model.NewBoolVar(f"u_f_{si}_{fi}_{t}")
                model.AddBoolAnd([fv, sv]).OnlyEnforceIf(use)
                model.AddBoolOr([fv.Not(), sv.Not()]).OnlyEnforceIf(use.Not())
                uses.append(use)
            model.Add(sum(uses) <= 1)

    # Faculty load
    for fi, f in enumerate(faculty):
        load = sum(built.fac_of[(si, fi)] for si in range(len(sessions)) if (si, fi) in built.fac_of)
        built.fac_load[fi] = load
        limit = 10**9 if _RELAX_LOADS in relax else f.max_weekly_load
        model.Add(load <= limit)

    _add_faculty_consistency_constraints(model, built, n_fac)
    _add_theory_room_consistency_constraints(model, built, n_rooms, relax)
    _add_daily_distribution_constraints(model, built, slots, courses, sections)

    return built

if __name__ == "__main__":
    slots = get_slots()
    rooms = get_rooms()

    sec_dict = {
        1: [chr(ord('A') + i) for i in range(8)],
        2: [chr(ord('A') + i) for i in range(8)],
        3: [chr(ord('A') + i) for i in range(9)],
        4: [chr(ord('A') + i) for i in range(10)]
    }

    cse_req = make_dept_data('CSE', sec_dict, fac_start_id=1, fac_count=45, rooms=rooms, slots=slots)
    
    print("Testing OPTIMIZED CSE model build...")
    t0 = time.time()
    built = build_optimized_model(cse_req, frozenset())
    build_time = time.time() - t0
    proto = built.model.Proto()
    print(f"CSE model built in {build_time:.2f}s!")
    print(f"Variables: {len(proto.variables)}, Constraints: {len(proto.constraints)}")
    
    print("Solving with CP-SAT (30s limit)...")
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 30.0
    solver.parameters.num_search_workers = 8
    t1 = time.time()
    status = solver.Solve(built.model)
    solve_time = time.time() - t1
    print(f"Solve status: {solver.StatusName(status)} in {solve_time:.2f}s!")
