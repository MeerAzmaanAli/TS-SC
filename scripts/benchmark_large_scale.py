"""
Standalone large-scale benchmark test for TS-SC timetable solver.
Tests the exact scale specified in docs/actualdata.md without touching the database.
"""

import sys
import os
import time

# Add solver directory to python path
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
from app.solver import solve

def build_benchmark_dataset():
    print("=" * 70)
    print("BUILDING LARGE-SCALE BENCHMARK DATASET")
    print("=" * 70)

    # 1. TIME SLOTS (Monday to Friday, 6 periods each = 30 slots)
    time_slots = [
        TimeSlot(id=f"d{d}p{p}", day_of_week=d, period=p)
        for d in range(1, 6)
        for p in range(1, 7)
    ]
    print(f"[*] Time Slots: {len(time_slots)} (5 days x 6 periods)")

    # 2. ROOMS & LABS
    # Main Block: 60 classrooms (101-120, 201-220, 301-320)
    # ME: 8 classrooms (ME-101 to ME-108)
    # CE: 8 classrooms (CE-101 to CE-108)
    # TE: 4 classrooms (TE-101 to TE-104)
    # EE: 1 classroom  (EE-101)
    # Labs: 20 labs (LAB-01 to LAB-20)
    rooms = []
    # Main block
    for floor in [1, 2, 3]:
        for room_no in range(1, 21):
            rooms.append(Room(id=f"MB-{floor * 100 + room_no}", room_type="classroom", capacity=70))
    # Department blocks
    for i in range(1, 9):
        rooms.append(Room(id=f"ME-10{i}", room_type="classroom", capacity=70))
        rooms.append(Room(id=f"CE-10{i}", room_type="classroom", capacity=70))
    for i in range(1, 5):
        rooms.append(Room(id=f"TE-10{i}", room_type="classroom", capacity=70))
    rooms.append(Room(id="EE-101", room_type="classroom", capacity=70))

    classrooms_count = len(rooms) # should be 60 + 8 + 8 + 4 + 1 = 81
    # 20 Labs
    for i in range(1, 21):
        rooms.append(Room(id=f"LAB-{i:02d}", room_type="lab", capacity=70))

    print(f"[*] Rooms: {len(rooms)} total ({classrooms_count} Classrooms, 20 Labs)")

    # 3. SECTIONS
    # CSE: 1st yr (A-H = 8), 2nd yr (A-H = 8), 3rd yr (A-I = 9), 4th yr (A-J = 10) -> 35
    # AI-DS: 1st, 2nd, 3rd, 4th = 2 each -> 8
    # IT: 1st, 2nd, 3rd, 4th = 4 each -> 16
    # Others: TCS (1/yr -> 4), IBM (2/yr -> 8), Apple (1/yr -> 4) -> 16
    sections = []
    prog_year_sections = {}

    def add_sec(prog_id, yr, sec_names):
        key = (prog_id, yr)
        prog_year_sections[key] = []
        for name in sec_names:
            sec_id = f"{prog_id}-Y{yr}-{name}"
            sec = Section(id=sec_id, strength=60, batch_count=2)
            sections.append(sec)
            prog_year_sections[key].append(sec_id)

    # CSE
    add_sec("CSE", 1, [chr(ord('A') + i) for i in range(8)])   # A-H
    add_sec("CSE", 2, [chr(ord('A') + i) for i in range(8)])   # A-H
    add_sec("CSE", 3, [chr(ord('A') + i) for i in range(9)])   # A-I
    add_sec("CSE", 4, [chr(ord('A') + i) for i in range(10)])  # A-J

    # AI-DS
    for y in range(1, 5):
        add_sec("AIDS", y, ["A", "B"])

    # IT
    for y in range(1, 5):
        add_sec("IT", y, ["A", "B", "C", "D"])

    # Others
    for y in range(1, 5):
        add_sec("TCS", y, ["A"])
        add_sec("IBM", y, ["A", "B"])
        add_sec("APPLE", y, ["A"])

    print(f"[*] Sections: {len(sections)} across all departments and programs")

    # 4. COURSES & SECTION-COURSES
    # "in each year there is 3 labs course(only one session in a week one per batch) 
    # and 4 theory course(2 course has 4 sessions a week and remaining 2 has 2 sessions per week)"
    # Theory: 2 courses * 4 sessions + 2 courses * 2 sessions = 12 sessions/week.
    # Lab: 3 courses * 1 session/week per batch (with batch_count=2 -> 6 lab sessions per week)
    # Total per section = 12 (theory) + 6 (lab) = 18 sessions/week out of 30 available slots.
    courses = []
    section_courses = []
    course_list_by_dept_yr = {}

    programs = ["CSE", "AIDS", "IT", "TCS", "IBM", "APPLE"]
    for prog in programs:
        for yr in range(1, 5):
            c_ids = []
            # 4 Theory courses (two 4-credit, two 2-credit)
            courses.append(Course(id=f"{prog}-Y{yr}-TH1", sessions_per_week=4, lab_required=False))
            courses.append(Course(id=f"{prog}-Y{yr}-TH2", sessions_per_week=4, lab_required=False))
            courses.append(Course(id=f"{prog}-Y{yr}-TH3", sessions_per_week=2, lab_required=False))
            courses.append(Course(id=f"{prog}-Y{yr}-TH4", sessions_per_week=2, lab_required=False))
            c_ids.extend([
                (f"{prog}-Y{yr}-TH1", False),
                (f"{prog}-Y{yr}-TH2", False),
                (f"{prog}-Y{yr}-TH3", False),
                (f"{prog}-Y{yr}-TH4", False),
            ])
            # 3 Lab courses (1 session/week each per batch)
            for l in range(1, 4):
                cid = f"{prog}-Y{yr}-LAB{l}"
                courses.append(Course(id=cid, sessions_per_week=1, lab_required=True))
                c_ids.append((cid, True))
            course_list_by_dept_yr[(prog, yr)] = c_ids

            # Link courses to all sections in this (prog, yr)
            for sec_id in prog_year_sections[(prog, yr)]:
                for cid, _ in c_ids:
                    section_courses.append(SectionCourse(section_id=sec_id, course_id=cid))

    print(f"[*] Distinct Courses: {len(courses)} (4 theory + 3 lab per program-year)")
    print(f"[*] Section-Course enrollments: {len(section_courses)}")

    # 5. FACULTY (100 Faculty members)
    # Max weekly load: 16 sessions/week (comfortable standard university workload)
    faculty = []
    for i in range(1, 101):
        faculty.append(Faculty(id=f"FAC-{i:03d}", max_weekly_load=18))
    print(f"[*] Faculty Members: {len(faculty)} (max load = 18 sessions/week)")

    # 6. QUALIFICATIONS
    # Each course has 3-4 faculty qualified to teach it to ensure flexibility
    qualifications = []
    n_fac = len(faculty)
    for idx, c in enumerate(courses):
        # assign 4 qualified faculty in round-robin fashion
        for k in range(4):
            fac_idx = (idx * 3 + k) % n_fac
            qualifications.append(Qualification(faculty_id=faculty[fac_idx].id, course_id=c.id))
    print(f"[*] Faculty Qualifications: {len(qualifications)}")

    req = GenerateRequest(
        institution_id="actual-institute-benchmark",
        sections=sections,
        courses=courses,
        section_courses=section_courses,
        faculty=faculty,
        rooms=rooms,
        time_slots=time_slots,
        qualifications=qualifications,
        time_limit_seconds=60.0,
    )

    return req

def run_benchmark():
    req = build_benchmark_dataset()

    print("\n" + "=" * 70)
    print("STARTING CP-SAT SOLVER EXECUTION")
    print("=" * 70)
    start_time = time.time()
    
    response = solve(req)
    
    elapsed = time.time() - start_time

    print("\n" + "=" * 70)
    print("SOLVER EXECUTION RESULTS")
    print("=" * 70)
    print(f"[*] Status:           {response.status.upper()}")
    print(f"[*] Time Taken:       {elapsed:.2f} seconds")
    print(f"[*] Scheduled Entries:{len(response.entries)}")

    if response.status == "ok":
        # Verification of hard constraints
        print("\n[*] Verifying Hard Constraints across all generated entries:")
        sec_clash = set()
        room_clash = set()
        fac_clash = set()
        violations = []

        for e in response.entries:
            # Section clash (for batch=None or same batch)
            s_key = (e.section_id, e.time_slot_id, e.batch)
            if (e.section_id, e.time_slot_id, None) in sec_clash or s_key in sec_clash:
                violations.append(f"Section clash: {e.section_id} at {e.time_slot_id}")
            sec_clash.add(s_key)

            # Room clash
            r_key = (e.room_id, e.time_slot_id)
            if r_key in room_clash:
                violations.append(f"Room clash: {e.room_id} at {e.time_slot_id}")
            room_clash.add(r_key)

            # Faculty clash
            f_key = (e.faculty_id, e.time_slot_id)
            if f_key in fac_clash:
                violations.append(f"Faculty clash: {e.faculty_id} at {e.time_slot_id}")
            fac_clash.add(f_key)

        if not violations:
            print("    [PASSED] 0 Section Clashes")
            print("    [PASSED] 0 Room Clashes")
            print("    [PASSED] 0 Faculty Clashes")
        else:
            print(f"    [FAILED] {len(violations)} clashes detected:")
            for v in violations[:10]:
                print("     -", v)

        # Faculty workload statistics
        fac_counts = {}
        for e in response.entries:
            fac_counts[e.faculty_id] = fac_counts.get(e.faculty_id, 0) + 1

        min_load = min(fac_counts.values()) if fac_counts else 0
        max_load = max(fac_counts.values()) if fac_counts else 0
        avg_load = sum(fac_counts.values()) / len(fac_counts) if fac_counts else 0
        print(f"\n[*] Faculty Load Distribution:")
        print(f"    - Active Faculty: {len(fac_counts)} / {len(req.faculty)}")
        print(f"    - Min Sessions:   {min_load}")
        print(f"    - Max Sessions:   {max_load}")
        print(f"    - Avg Sessions:   {avg_load:.1f}")

        # Violations (soft constraints)
        print(f"\n[*] Soft Constraint Metrics:")
        for k, v in response.violations.items():
            print(f"    - {k}: {v}")

    elif response.status == "infeasible":
        print(f"[!] Infeasibility Detected!")
        print(f"[!] Causes: {response.causes}")
        print(f"[!] Message: {response.message}")

if __name__ == "__main__":
    run_benchmark()

