"""
Fast formulation benchmark for large-scale institute scheduling.
Compares:
1. Monolithic solve of all 75 sections (1,350 sessions).
2. Departmental partitioned solve (CSE: 35 sections, IT: 16, Others: 16, AIDS: 8).
"""

import sys
import os
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "solver"))

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
from app.solver import _build_model, _solve_built, cp_model

def get_slots():
    return [TimeSlot(id=f"d{d}p{p}", day_of_week=d, period=p) for d in range(1, 6) for p in range(1, 7)]

def get_rooms():
    rooms = []
    # Main block: 60 classrooms
    for floor in [1, 2, 3]:
        for room_no in range(1, 21):
            rooms.append(Room(id=f"MB-{floor * 100 + room_no}", room_type="classroom", capacity=70))
    for i in range(1, 9):
        rooms.append(Room(id=f"ME-10{i}", room_type="classroom", capacity=70))
        rooms.append(Room(id=f"CE-10{i}", room_type="classroom", capacity=70))
    for i in range(1, 5):
        rooms.append(Room(id=f"TE-10{i}", room_type="classroom", capacity=70))
    rooms.append(Room(id="EE-101", room_type="classroom", capacity=70))
    for i in range(1, 21):
        rooms.append(Room(id=f"LAB-{i:02d}", room_type="lab", capacity=70))
    return rooms

def make_dept_data(dept_code, sec_names_by_yr, fac_start_id, fac_count, rooms, slots):
    sections = []
    courses = []
    section_courses = []
    
    for yr, sec_names in sec_names_by_yr.items():
        # 4 Theory courses (two 4-period, two 2-period)
        th1 = f"{dept_code}-Y{yr}-TH1"
        th2 = f"{dept_code}-Y{yr}-TH2"
        th3 = f"{dept_code}-Y{yr}-TH3"
        th4 = f"{dept_code}-Y{yr}-TH4"
        courses.append(Course(id=th1, sessions_per_week=4, lab_required=False))
        courses.append(Course(id=th2, sessions_per_week=4, lab_required=False))
        courses.append(Course(id=th3, sessions_per_week=2, lab_required=False))
        courses.append(Course(id=th4, sessions_per_week=2, lab_required=False))
        
        # 3 Lab courses (1 period per batch)
        lab1 = f"{dept_code}-Y{yr}-LAB1"
        lab2 = f"{dept_code}-Y{yr}-LAB2"
        lab3 = f"{dept_code}-Y{yr}-LAB3"
        courses.append(Course(id=lab1, sessions_per_week=1, lab_required=True))
        courses.append(Course(id=lab2, sessions_per_week=1, lab_required=True))
        courses.append(Course(id=lab3, sessions_per_week=1, lab_required=True))
        
        all_cids = [th1, th2, th3, th4, lab1, lab2, lab3]
        for name in sec_names:
            sec_id = f"{dept_code}-Y{yr}-{name}"
            sections.append(Section(id=sec_id, strength=60, batch_count=2))
            for cid in all_cids:
                section_courses.append(SectionCourse(section_id=sec_id, course_id=cid))
                
    faculty = [Faculty(id=f"FAC-{i:03d}", max_weekly_load=18) for i in range(fac_start_id, fac_start_id + fac_count)]
    qualifications = []
    for idx, c in enumerate(courses):
        for k in range(3):
            fac_idx = (idx * 2 + k) % len(faculty)
            qualifications.append(Qualification(faculty_id=faculty[fac_idx].id, course_id=c.id))
            
    req = GenerateRequest(
        institution_id=dept_code.lower(),
        sections=sections,
        courses=courses,
        section_courses=section_courses,
        faculty=faculty,
        rooms=rooms,
        time_slots=slots,
        qualifications=qualifications,
        time_limit_seconds=30.0
    )
    return req

if __name__ == "__main__":
    slots = get_slots()
    rooms = get_rooms()
    
    print("Testing Departmental Benchmark: AI-DS (8 sections, 144 sessions)...")
    aids_req = make_dept_data(
        "AIDS",
        {1: ["A", "B"], 2: ["A", "B"], 3: ["A", "B"], 4: ["A", "B"]},
        fac_start_id=1,
        fac_count=15,
        rooms=rooms,
        slots=slots
    )
    t0 = time.time()
    built = _build_model(aids_req, frozenset())
    build_time = time.time() - t0
    print(f"AIDS model built in {build_time:.2f}s ({len(built.sessions)} sessions). Solving...")
    t1 = time.time()
    solver, status = _solve_built(built, 15.0)
    solve_time = time.time() - t1
    print(f"AIDS solve status: {solver.StatusName(status)} in {solve_time:.2f}s!\n")

    print("Testing Departmental Benchmark: IT (16 sections, 288 sessions)...")
    it_req = make_dept_data(
        "IT",
        {1: ["A", "B", "C", "D"], 2: ["A", "B", "C", "D"], 3: ["A", "B", "C", "D"], 4: ["A", "B", "C", "D"]},
        fac_start_id=16,
        fac_count=25,
        rooms=rooms,
        slots=slots
    )
    t0 = time.time()
    built_it = _build_model(it_req, frozenset())
    build_time_it = time.time() - t0
    print(f"IT model built in {build_time_it:.2f}s ({len(built_it.sessions)} sessions). Solving...")
    t1 = time.time()
    solver_it, status_it = _solve_built(built_it, 20.0)
    solve_time_it = time.time() - t1
    print(f"IT solve status: {solver_it.StatusName(status_it)} in {solve_time_it:.2f}s!\n")

