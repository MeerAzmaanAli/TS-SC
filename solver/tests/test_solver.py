"""Smoke tests for the CP-SAT solver (run: pytest tests/)."""

from app.schemas import (
    Course,
    Faculty,
    GenerateRequest,
    Qualification,
    Room,
    Section,
    SectionCourse,
    TimeSlot,
)
from app.solver import solve


def _demo_request(**overrides):
    sections = [Section(id="sec-a", strength=60), Section(id="sec-b", strength=55)]
    courses = [
        Course(id="cs501", sessions_per_week=3),
        Course(id="cs502", sessions_per_week=2, lab_required=True),
        Course(id="cs503", sessions_per_week=2),
    ]
    section_courses = [
        SectionCourse(section_id="sec-a", course_id="cs501"),
        SectionCourse(section_id="sec-a", course_id="cs502"),
        SectionCourse(section_id="sec-a", course_id="cs503"),
        SectionCourse(section_id="sec-b", course_id="cs501"),
        SectionCourse(section_id="sec-b", course_id="cs503"),
    ]
    faculty = [
        Faculty(id="f1", max_weekly_load=10),
        Faculty(id="f2", max_weekly_load=10),
        Faculty(id="f3", max_weekly_load=10),
    ]
    rooms = [
        Room(id="r1", room_type="classroom", capacity=70),
        Room(id="r2", room_type="classroom", capacity=70),
        Room(id="lab1", room_type="lab", capacity=65),
    ]
    slots = [
        TimeSlot(id=f"d{d}p{p}", day_of_week=d, period=p)
        for d in range(1, 6)
        for p in range(1, 5)
    ]
    qualifications = [
        Qualification(faculty_id="f1", course_id="cs501"),
        Qualification(faculty_id="f1", course_id="cs503"),
        Qualification(faculty_id="f2", course_id="cs502"),
        Qualification(faculty_id="f2", course_id="cs501"),
        Qualification(faculty_id="f3", course_id="cs503"),
        Qualification(faculty_id="f3", course_id="cs502"),
    ]
    kwargs = dict(
        institution_id="demo",
        sections=sections,
        courses=courses,
        section_courses=section_courses,
        faculty=faculty,
        rooms=rooms,
        time_slots=slots,
        qualifications=qualifications,
        time_limit_seconds=30,
    )
    kwargs.update(overrides)
    return GenerateRequest(**kwargs)


def _assert_no_clashes(resp):
    seen_section, seen_room, seen_fac = set(), set(), set()
    slot_of = {t.id: (t.day_of_week, t.period) for t in _demo_request().time_slots}
    assert len(resp.entries) == 12  # 3+2+2 + 3+2 sessions
    for e in resp.entries:
        assert (e.section_id, e.time_slot_id) not in seen_section, "section double-booked"
        assert (e.room_id, e.time_slot_id) not in seen_room, "room double-booked"
        assert (e.faculty_id, e.time_slot_id) not in seen_fac, "faculty double-booked"
        seen_section.add((e.section_id, e.time_slot_id))
        seen_room.add((e.room_id, e.time_slot_id))
        seen_fac.add((e.faculty_id, e.time_slot_id))
    # lab course must be in the lab
    for e in resp.entries:
        if e.course_id == "cs502":
            assert e.room_id == "lab1", "lab course not in lab room"


def test_feasible_timetable():
    resp = solve(_demo_request())
    assert resp.status == "ok", resp.message
    _assert_no_clashes(resp)
    assert resp.violations["sessions_scheduled"] == 12


def test_infeasible_reports_cause():
    # One slot total, two sessions needed -> impossible; loads relaxed won't help,
    # rooms relaxed won't help... only "unknown" or slot-grid. Just assert infeasible
    # is reported with a non-empty cause list.
    req = _demo_request(
        time_slots=[TimeSlot(id="only", day_of_week=1, period=1)],
        time_limit_seconds=10,
    )
    resp = solve(req)
    assert resp.status == "infeasible"
    assert len(resp.causes) > 0


def test_elective_block_violation():
    from app.schemas import Course as C

    req = _demo_request()
    req.courses = [
        C(id="cs501", sessions_per_week=3),
        C(id="cs502", sessions_per_week=2, lab_required=True),
        C(id="cs503", sessions_per_week=2, is_elective=True),
    ]
    # elective block covers only Monday; cs503 needs 2 sessions x2 sections = 4
    # sessions but only 4 Monday slots exist and sec-a/sec-b clash rules apply...
    # simpler: no blocks at all -> structural infeasibility naming electives
    req.elective_blocks = []
    resp = solve(req)
    assert resp.status == "infeasible"
    assert "elective" in resp.message.lower() or "elective_blocks" in resp.causes


def test_parallel_lab_batches():
    """Verify institutional lab batch scheduling:
    - 60-student section divided into B1 and B2 (strength 30 each)
    - Labs seat 35 (whole section doesn't fit, but batches do)
    - Theory courses: section attends together
    - Lab slots: B1 and B2 attend simultaneously in different lab courses
    """
    req = GenerateRequest(
        institution_id="inst1",
        sections=[Section(id="sec-cs-a", strength=60, batch_count=2)],
        courses=[
            Course(id="cs501", sessions_per_week=3, lab_required=False),   # Theory: Deep Learning
            Course(id="cs501p", sessions_per_week=2, lab_required=True),   # Lab: Deep Learning
            Course(id="cs502", sessions_per_week=3, lab_required=False),   # Theory: DBMS
            Course(id="cs502p", sessions_per_week=2, lab_required=True),   # Lab: DBMS
        ],
        section_courses=[
            SectionCourse(section_id="sec-cs-a", course_id="cs501"),
            SectionCourse(section_id="sec-cs-a", course_id="cs501p"),
            SectionCourse(section_id="sec-cs-a", course_id="cs502"),
            SectionCourse(section_id="sec-cs-a", course_id="cs502p"),
        ],
        faculty=[
            Faculty(id="prof-dl", max_weekly_load=15),
            Faculty(id="prof-dbms", max_weekly_load=15),
        ],
        rooms=[
            Room(id="cr101", room_type="classroom", capacity=70),
            Room(id="lab1", room_type="lab", capacity=35),
            Room(id="lab2", room_type="lab", capacity=35),
        ],
        time_slots=[
            TimeSlot(id=f"d{d}p{p}", day_of_week=d, period=p)
            for d in range(1, 6)
            for p in range(1, 5)
        ],
        qualifications=[
            Qualification(faculty_id="prof-dl", course_id="cs501"),
            Qualification(faculty_id="prof-dl", course_id="cs501p"),
            Qualification(faculty_id="prof-dbms", course_id="cs502"),
            Qualification(faculty_id="prof-dbms", course_id="cs502p"),
        ],
        time_limit_seconds=15,
    )
    resp = solve(req)
    assert resp.status == "ok", resp.message
    # 3 (cs501) + 3 (cs502) + 2*2 (cs501p batches) + 2*2 (cs502p batches) = 14 sessions
    assert len(resp.entries) == 14

    # Group entries by slot
    by_slot = {}
    for e in resp.entries:
        by_slot.setdefault(e.time_slot_id, []).append(e)

    lab_slots_count = 0
    for slot_id, slot_entries in by_slot.items():
        lab_entries = [e for e in slot_entries if e.batch is not None]
        theory_entries = [e for e in slot_entries if e.batch is None]

        if lab_entries:
            lab_slots_count += 1
            # In a lab slot, both batches must be present
            assert len(lab_entries) == 2, f"Slot {slot_id} has {len(lab_entries)} lab batches instead of 2"
            # Both batches must be doing different lab courses
            batches = {e.batch for e in lab_entries}
            courses = {e.course_id for e in lab_entries}
            assert batches == {1, 2}, f"Slot {slot_id} missing batch"
            assert len(courses) == 2, f"Both batches cannot do the same lab course in slot {slot_id}"
            # No theory class during lab slot
            assert len(theory_entries) == 0, f"Slot {slot_id} has theory during lab"
            # Both lab entries must be in lab rooms with capacity >= 30
            for e in lab_entries:
                assert e.room_id in ("lab1", "lab2")
        else:
            # Theory slot: at most 1 theory entry, whole section
            assert len(theory_entries) == 1
            assert theory_entries[0].room_id == "cr101"

    # Total 4 lab slots (2 courses * 2 sessions each = 4 parallel lab slots)
    assert lab_slots_count == 4


def test_faculty_consistency_and_daily_spread():
    """Verify solutions to User Issues 1, 2, and 3:
    1. Issue 1: Max 1 theory session per course per day; no 2 or 3 consecutive hours of same course.
    2. Issue 2: Uniform weekday spread; no weekday left completely blank when sessions are sufficient.
    3. Issue 3: Single faculty member per course offering per section (consistent instructor).
    """
    sections = [
        Section(id="sec-cs-a", strength=58, batch_count=2),
        Section(id="sec-cs-b", strength=58, batch_count=2),
    ]
    courses = [
        Course(id="cs501", sessions_per_week=3, lab_required=False),  # OS Theory
        Course(id="cs501p", sessions_per_week=2, lab_required=True),  # OS Lab
        Course(id="cs502", sessions_per_week=3, lab_required=False),  # DBMS Theory
        Course(id="cs502p", sessions_per_week=2, lab_required=True),  # DBMS Lab
        Course(id="cs503", sessions_per_week=3, lab_required=False),  # CN Theory
    ]
    faculty = [
        Faculty(id="prof-asha", max_weekly_load=18),
        Faculty(id="prof-rohit", max_weekly_load=18),
        Faculty(id="prof-neha", max_weekly_load=18),
    ]
    rooms = [
        Room(id="cr101", room_type="classroom", capacity=70),
        Room(id="cr102", room_type="classroom", capacity=70),
        Room(id="lab1", room_type="lab", capacity=35),
        Room(id="lab2", room_type="lab", capacity=35),
    ]
    slots = [
        TimeSlot(id=f"d{d}p{p}", day_of_week=d, period=p)
        for d in range(1, 6)
        for p in range(1, 7)  # 6 periods per day, 5 days
    ]
    qualifications = [
        Qualification(faculty_id="prof-asha", course_id="cs501"),
        Qualification(faculty_id="prof-asha", course_id="cs501p"),
        Qualification(faculty_id="prof-asha", course_id="cs503"),
        Qualification(faculty_id="prof-rohit", course_id="cs502"),
        Qualification(faculty_id="prof-rohit", course_id="cs502p"),
        Qualification(faculty_id="prof-rohit", course_id="cs501"),
        Qualification(faculty_id="prof-rohit", course_id="cs501p"),
        Qualification(faculty_id="prof-neha", course_id="cs503"),
        Qualification(faculty_id="prof-neha", course_id="cs502p"),
        Qualification(faculty_id="prof-neha", course_id="cs501p"),
    ]
    section_courses = [
        SectionCourse(section_id="sec-cs-a", course_id=cid)
        for cid in ["cs501", "cs501p", "cs502", "cs502p", "cs503"]
    ] + [
        SectionCourse(section_id="sec-cs-b", course_id=cid)
        for cid in ["cs501", "cs501p", "cs502", "cs502p", "cs503"]
    ]

    req = GenerateRequest(
        institution_id="demo-inst",
        sections=sections,
        courses=courses,
        section_courses=section_courses,
        faculty=faculty,
        rooms=rooms,
        time_slots=slots,
        qualifications=qualifications,
        time_limit_seconds=20,
    )

    resp = solve(req)
    assert resp.status == "ok", resp.message
    # (3 + 2*2 + 3 + 2*2 + 3) * 2 sections = 17 * 2 = 34 sessions
    assert len(resp.entries) == 34

    slot_lookup = {t.id: t for t in slots}

    # Verify Issue 3: Strict Faculty Consistency
    # For every (section_id, course_id), exactly one unique faculty teaches all sessions!
    sec_course_entries: dict[tuple[str, str], list] = {}
    for e in resp.entries:
        sec_course_entries.setdefault((e.section_id, e.course_id), []).append(e)

    for (sec_id, crs_id), entries in sec_course_entries.items():
        faculties = {e.faculty_id for e in entries}
        assert len(faculties) == 1, (
            f"Section {sec_id} course {crs_id} assigned multiple faculty: {faculties}"
        )

    # Verify Issue 1: Max 1 theory session per course per day, no consecutive theory sessions
    for (sec_id, crs_id), entries in sec_course_entries.items():
        is_lab = any(e.batch is not None for e in entries)
        if not is_lab:
            # Theory course
            days_with_course = [slot_lookup[e.time_slot_id].day_of_week for e in entries]
            # Each theory lecture must be on a distinct day (at most 1 per day)
            assert len(days_with_course) == len(set(days_with_course)), (
                f"Theory course {crs_id} for {sec_id} scheduled multiple times on the same day: {days_with_course}"
            )
        else:
            # Lab course: at most 2 periods per day for any batch
            batch_days: dict[int, list[int]] = {}
            for e in entries:
                batch_days.setdefault(e.batch, []).append(slot_lookup[e.time_slot_id].day_of_week)
            for b, b_days in batch_days.items():
                for d in range(1, 6):
                    assert b_days.count(d) <= 2, (
                        f"Lab course {crs_id} batch {b} for {sec_id} scheduled > 2 times on day {d}"
                    )

    # Verify Issue 2: Weekday Spread
    # When 17 sessions exist across 5 days, all 5 weekdays must have classes scheduled
    for sec in sections:
        sec_days = {
            slot_lookup[e.time_slot_id].day_of_week
            for e in resp.entries
            if e.section_id == sec.id
        }
        assert sec_days == {1, 2, 3, 4, 5}, (
            f"Section {sec.id} has empty weekdays! Active days: {sec_days}"
        )


