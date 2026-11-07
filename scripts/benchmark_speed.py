import sys
import os
import time
import csv
sys.path.insert(0, os.path.abspath("solver"))
from ortools.sat.python import cp_model
from app.schemas import (
    GenerateRequest, Section, Course, Faculty, Room, TimeSlot,
    Qualification, SectionCourse, Weights
)

def benchmark():
    data_dir = os.path.join("data", "institutional")
    with open(os.path.join(data_dir, "sections.csv"), encoding="utf-8") as f:
        csv_sections = list(csv.DictReader(f))
    with open(os.path.join(data_dir, "courses.csv"), encoding="utf-8") as f:
        csv_courses = list(csv.DictReader(f))
    with open(os.path.join(data_dir, "rooms.csv"), encoding="utf-8") as f:
        csv_rooms = list(csv.DictReader(f))
    with open(os.path.join(data_dir, "faculty.csv"), encoding="utf-8") as f:
        csv_faculty = list(csv.DictReader(f))
    with open(os.path.join(data_dir, "time_slots.csv"), encoding="utf-8") as f:
        csv_slots = list(csv.DictReader(f))
    with open(os.path.join(data_dir, "faculty_qualifications.csv"), encoding="utf-8") as f:
        csv_quals = list(csv.DictReader(f))
    with open(os.path.join(data_dir, "section_courses.csv"), encoding="utf-8") as f:
        csv_sec_courses = list(csv.DictReader(f))

    sections = [Section(id=s["code"], strength=int(s["strength"]), batch_count=int(s["batch_count"]), shift=int(s["shift"])) for s in csv_sections]
    courses = [Course(id=c["code"], sessions_per_week=int(c["sessions_per_week"]), lab_required=(c["lab_required"].lower() == "true")) for c in csv_courses]
    rooms = [Room(id=r["code"], room_type=r["room_type"], capacity=int(r["capacity"])) for r in csv_rooms]
    faculty = [Faculty(id=f["faculty_id"], max_weekly_load=int(f["max_weekly_load"])) for f in csv_faculty]
    slots = [TimeSlot(id=sl["slot_code"], day_of_week=int(sl["day_of_week"]), period=int(sl["period"])) for sl in csv_slots]
    quals = [Qualification(faculty_id=q["faculty_id"], course_id=q["course_code"]) for q in csv_quals]
    sec_courses = [SectionCourse(section_id=sc["section_code"], course_id=sc["course_code"]) for sc in csv_sec_courses]

    sec_map = {s.id: s for s in sections}
    crs_map = {c.id: c for c in courses}
    fac_map = {f.id: f for f in faculty}
    qual_map = {}
    for q in quals:
        qual_map.setdefault(q.course_id, []).append(q.faculty_id)

    classrooms = [r for r in rooms if r.room_type == "classroom"]
    labs = [r for r in rooms if r.room_type == "lab"]

    # Stage 1: Faculty Allocation
    t0 = time.time()
    teaching_units = []
    for sc in sec_courses:
        sec = sec_map[sc.section_id]
        crs = crs_map[sc.course_id]
        n_sess = sc.sessions_per_week or crs.sessions_per_week
        b_count = max(1, getattr(sec, "batch_count", 1) or 1)
        if crs.lab_required and b_count > 1:
            for b in range(1, b_count + 1):
                teaching_units.append((sec.id, crs.id, b, n_sess))
        else:
            teaching_units.append((sec.id, crs.id, None, n_sess))

    f_model = cp_model.CpModel()
    fa_vars = {}
    for u_idx, (sec_id, c_id, batch, load) in enumerate(teaching_units):
        cand_facs = qual_map.get(c_id, [])
        u_vars = []
        for fid in cand_facs:
            v = f_model.NewBoolVar(f"fa_{u_idx}_{fid}")
            fa_vars[(u_idx, fid)] = v
            u_vars.append(v)
        f_model.Add(sum(u_vars) == 1)

    for fid, f in fac_map.items():
        f_terms = [fa_vars[(u_idx, fid)] * load for u_idx, (sec_id, c_id, batch, load) in enumerate(teaching_units) if (u_idx, fid) in fa_vars]
        if f_terms:
            f_model.Add(sum(f_terms) <= f.max_weekly_load)

    f_solver = cp_model.CpSolver()
    f_solver.parameters.max_time_in_seconds = 5.0
    f_solver.parameters.num_search_workers = 8
    f_status = f_solver.Solve(f_model)
    print(f"Stage 1 solved in {time.time()-t0:.2f}s with status {f_solver.StatusName(f_status)}")

    unit_fac = {}
    for u_idx, (sec_id, c_id, batch, load) in enumerate(teaching_units):
        for fid in qual_map[c_id]:
            if f_solver.Value(fa_vars[(u_idx, fid)]) == 1:
                unit_fac[u_idx] = fid
                break

    # Sessions
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
                "shift": sec_map[sec_id].shift,
            })

    # Test A: Pure Satisfaction (NO GAP VARIABLES)
    t1 = time.time()
    s_model = cp_model.CpModel()
    shift_allowed_periods = {1: {1, 2, 3, 4, 5, 6}, 2: {3, 4, 5, 6, 7, 8}}
    slot_of = {}
    for si, sess in enumerate(sessions):
        allowed_ti = [ti for ti, sl in enumerate(slots) if sl.period in shift_allowed_periods[sess["shift"]]]
        for ti in allowed_ti:
            slot_of[(si, ti)] = s_model.NewBoolVar(f"s_{si}_{ti}")
        s_model.Add(sum(slot_of[(si, ti)] for ti in allowed_ti) == 1)

    for ti in range(len(slots)):
        for sec_id in sec_map:
            th_vars = [slot_of[(si, ti)] for si, s in enumerate(sessions) if s["sec_id"] == sec_id and not s["is_lab"] and (si, ti) in slot_of]
            b1_vars = [slot_of[(si, ti)] for si, s in enumerate(sessions) if s["sec_id"] == sec_id and s["batch"] == 1 and (si, ti) in slot_of]
            b2_vars = [slot_of[(si, ti)] for si, s in enumerate(sessions) if s["sec_id"] == sec_id and s["batch"] == 2 and (si, ti) in slot_of]
            if th_vars:
                s_model.Add(sum(th_vars) <= 1)
            if th_vars and b1_vars:
                s_model.Add(sum(th_vars) + sum(b1_vars) <= 1)
            if th_vars and b2_vars:
                s_model.Add(sum(th_vars) + sum(b2_vars) <= 1)
            if b1_vars and b2_vars:
                s_model.Add(sum(b1_vars) <= 1)
                s_model.Add(sum(b2_vars) <= 1)
                s_model.Add(sum(b1_vars) == sum(b2_vars))

    for ti in range(len(slots)):
        for fid in fac_map:
            f_sess = [slot_of[(si, ti)] for si, s in enumerate(sessions) if s["faculty_id"] == fid and (si, ti) in slot_of]
            if len(f_sess) > 1:
                s_model.Add(sum(f_sess) <= 1)

    for ti in range(len(slots)):
        lab_vars = [slot_of[(si, ti)] for si, s in enumerate(sessions) if s["is_lab"] and (si, ti) in slot_of]
        s_model.Add(sum(lab_vars) <= len(labs))
        th_vars = [slot_of[(si, ti)] for si, s in enumerate(sessions) if not s["is_lab"] and (si, ti) in slot_of]
        s_model.Add(sum(th_vars) <= len(classrooms))

    for d in range(1, 6):
        d_slots = [ti for ti, sl in enumerate(slots) if sl.day_of_week == d]
        for sec_id in sec_map:
            for c_id, crs in crs_map.items():
                if not crs.lab_required:
                    c_sis = [si for si, s in enumerate(sessions) if s["sec_id"] == sec_id and s["course_id"] == c_id]
                    if crs.sessions_per_week <= 5:
                        day_c_vars = [slot_of[(si, ti)] for si in c_sis for ti in d_slots if (si, ti) in slot_of]
                        if day_c_vars:
                            s_model.Add(sum(day_c_vars) <= 1)

    print(f"Stage 2 (Pure linear satisfaction) model built in {time.time()-t1:.2f}s! Solving...")
    s_solver = cp_model.CpSolver()
    s_solver.parameters.max_time_in_seconds = 30.0
    s_solver.parameters.num_search_workers = 8
    t_solve = time.time()
    s_status = s_solver.Solve(s_model)
    print(f"Pure satisfaction solved in {time.time()-t_solve:.2f}s with status {s_solver.StatusName(s_status)}!")

if __name__ == "__main__":
    benchmark()

