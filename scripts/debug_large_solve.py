import sys
import os
import time
import csv
sys.path.insert(0, os.path.abspath("solver"))
from app.schemas import (
    GenerateRequest, Section, Course, Faculty, Room, TimeSlot,
    Qualification, SectionCourse, Weights
)
from app.solver import solve, _solve_fast_institutional

def test():
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

    sections = [
        Section(id=s["code"], strength=int(s["strength"]), batch_count=int(s["batch_count"]), shift=int(s["shift"]))
        for s in csv_sections
    ]
    courses = [
        Course(id=c["code"], sessions_per_week=int(c["sessions_per_week"]), lab_required=(c["lab_required"].lower() == "true"))
        for c in csv_courses
    ]
    rooms = [
        Room(id=r["code"], room_type=r["room_type"], capacity=int(r["capacity"]))
        for r in csv_rooms
    ]
    faculty = [
        Faculty(id=f["faculty_id"], max_weekly_load=int(f["max_weekly_load"]))
        for f in csv_faculty
    ]
    slots = [
        TimeSlot(id=sl["slot_code"], day_of_week=int(sl["day_of_week"]), period=int(sl["period"]))
        for sl in csv_slots
    ]
    quals = [
        Qualification(faculty_id=q["faculty_id"], course_id=q["course_code"])
        for q in csv_quals
    ]
    sec_courses = [
        SectionCourse(section_id=sc["section_code"], course_id=sc["course_code"])
        for sc in csv_sec_courses
    ]

    req = GenerateRequest(
        institution_id="inst-large",
        sections=sections,
        courses=courses,
        section_courses=sec_courses,
        faculty=faculty,
        rooms=rooms,
        time_slots=slots,
        qualifications=quals,
        elective_blocks=[],
        weights=Weights(gap=10, spread=5, load=5),
        time_limit_seconds=60,
    )

    print("Calling _solve_fast_institutional directly...")
    t0 = time.time()
    resp = _solve_fast_institutional(req)
    print(f"Direct fast engine result: {resp is not None} in {time.time()-t0:.2f}s")
    if resp:
        print("Status:", resp.status)
        print("Entries count:", len(resp.entries))

if __name__ == "__main__":
    test()

