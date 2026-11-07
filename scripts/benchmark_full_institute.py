"""
Full Institute Benchmark for 75 Sections, 101 Rooms, 100 Faculty, 1,350 Sessions.
Implements the exact curriculum from actualdata.md:
- 4 theory courses (two 4-session, two 2-session = 12 periods/week)
- 3 lab courses (1 session/week per batch, 2 batches = 6 periods/week)
- Total 18 periods per section per week.
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

def create_slots():
    return [TimeSlot(id=f"d{d}p{p}", day_of_week=d, period=p) for d in range(1, 6) for p in range(1, 7)]

def create_rooms():
    rooms = []
    # Main block: 60 classrooms (101-120, 201-220, 301-320)
    for floor in [1, 2, 3]:
        for room_no in range(1, 21):
            rooms.append(Room(id=f"MB-{floor * 100 + room_no}", room_type="classroom", capacity=70))
    # ME, CE, TE, EE classrooms
    for i in range(1, 9):
        rooms.append(Room(id=f"ME-10{i}", room_type="classroom", capacity=70))
        rooms.append(Room(id=f"CE-10{i}", room_type="classroom", capacity=70))
    for i in range(1, 5):
        rooms.append(Room(id=f"TE-10{i}", room_type="classroom", capacity=70))
    rooms.append(Room(id="EE-101", room_type="classroom", capacity=70))
    # 20 Labs
    for i in range(1, 21):
        rooms.append(Room(id=f"LAB-{i:02d}", room_type="lab", capacity=70))
    return rooms

def make_curriculum(dept_code, yr):
    """
    4 theory courses (two 4-period, two 2-period)
    3 lab courses (1 period/week per batch)
    """
    courses = [
        Course(id=f"{dept_code}-Y{yr}-TH1", sessions_per_week=4, lab_required=False),
        Course(id=f"{dept_code}-Y{yr}-TH2", sessions_per_week=4, lab_required=False),
        Course(id=f"{dept_code}-Y{yr}-TH3", sessions_per_week=2, lab_required=False),
        Course(id=f"{dept_code}-Y{yr}-TH4", sessions_per_week=2, lab_required=False),
        Course(id=f"{dept_code}-Y{yr}-LAB1", sessions_per_week=1, lab_required=True),
        Course(id=f"{dept_code}-Y{yr}-LAB2", sessions_per_week=1, lab_required=True),
        Course(id=f"{dept_code}-Y{yr}-LAB3", sessions_per_week=1, lab_required=True),
    ]
    return courses

def build_department_spec(dept_name, dept_code, sec_counts, fac_start_id, fac_count, assigned_rooms, slots):
    sections = []
    courses = []
    section_courses = []
    
    for yr, count in sec_counts.items():
        yr_courses = make_curriculum(dept_code, yr)
        courses.extend(yr_courses)
        for i in range(count):
            sec_name = chr(ord('A') + i)
            sec_id = f"{dept_code}-Y{yr}-{sec_name}"
            sections.append(Section(id=sec_id, strength=60, batch_count=2))
            for c in yr_courses:
                section_courses.append(SectionCourse(section_id=sec_id, course_id=c.id))
                
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
        rooms=assigned_rooms,
        time_slots=slots,
        qualifications=qualifications,
        time_limit_seconds=25.0
    )
    return req

def print_summary():
    slots = create_slots()
    all_rooms = create_rooms()
    classrooms = [r for r in all_rooms if r.room_type == "classroom"]
    labs = [r for r in all_rooms if r.room_type == "lab"]
    
    # Department breakdown
    depts = [
        ("AI-DS", "AIDS", {1: 2, 2: 2, 3: 2, 4: 2}, 1, 12, classrooms[0:8] + labs[0:4]),
        ("IT", "IT", {1: 4, 2: 4, 3: 4, 4: 4}, 13, 22, classrooms[8:24] + labs[4:10]),
        ("Specialized Programs (TCS/IBM/Apple)", "SPEC", {1: 4, 2: 4, 3: 4, 4: 4}, 35, 22, classrooms[24:40] + labs[10:15]),
        ("CSE", "CSE", {1: 8, 2: 8, 3: 9, 4: 10}, 57, 44, classrooms[40:75] + labs[15:20]),
    ]
    
    total_sections = sum(sum(d[2].values()) for d in depts)
    total_theory_sessions = total_sections * 12
    total_lab_sessions = total_sections * 6
    total_sessions = total_theory_sessions + total_lab_sessions
    
    print("=" * 80)
    print("LARGE-SCALE INSTITUTE CAPACITY & SCHEDULING SPECIFICATION")
    print("=" * 80)
    print(f"Total Academic Sections:     {total_sections}")
    print(f"Total Available Classrooms:   {len(classrooms)} (Main Block: 60, ME: 8, CE: 8, TE: 4, EE: 1)")
    print(f"Total Available Laboratories: {len(labs)} (20 Labs)")
    print(f"Total Assumed Faculty:        100 (Max load: 18 periods/week)")
    print(f"Weekly Time Slots:            {len(slots)} (5 days x 6 periods/day)")
    print("-" * 80)
    print("CURRICULUM PER SECTION:")
    print("  - 4 Theory Courses:")
    print("      Course 1: 4 sessions / week")
    print("      Course 2: 4 sessions / week")
    print("      Course 3: 2 sessions / week")
    print("      Course 4: 2 sessions / week")
    print("      -> Subtotal: 12 theory periods / week")
    print("  - 3 Laboratory Courses:")
    print("      Lab 1: 1 session / week per batch (synchronized)")
    print("      Lab 2: 1 session / week per batch (synchronized)")
    print("      Lab 3: 1 session / week per batch (synchronized)")
    print("      -> Subtotal: 6 batch lab periods (3 synchronized timetable slots) / week")
    print(f"  - Total scheduled sessions per section: 18 periods")
    print(f"  - Student workload: 15 periods / week (50% timetable density)")
    print("-" * 80)
    print(f"GLOBAL WORKLOAD:")
    print(f"  - Total Theory Sessions to Schedule: {total_theory_sessions}")
    print(f"  - Total Lab Sessions to Schedule:    {total_lab_sessions}")
    print(f"  - Grand Total Sessions:              {total_sessions}")
    print("=" * 80)
    
    print("\nCAPACITY UTILIZATION:")
    classroom_capacity = len(classrooms) * len(slots)
    lab_capacity = len(labs) * len(slots)
    faculty_capacity = 100 * 18
    
    print(f"  Classroom Slot Capacity:  {classroom_capacity} slot-hours | Demand: {total_theory_sessions} ({total_theory_sessions/classroom_capacity*100:.1f}% utilization)")
    print(f"  Laboratory Slot Capacity: {lab_capacity} slot-hours | Demand: {total_sections * 3} ({total_sections * 3/lab_capacity*100:.1f}% utilization)")
    print(f"  Faculty Teaching Capacity: {faculty_capacity} slot-hours | Demand: {total_sessions} ({total_sessions/faculty_capacity*100:.1f}% utilization)")
    print("=" * 80)

if __name__ == "__main__":
    print_summary()

