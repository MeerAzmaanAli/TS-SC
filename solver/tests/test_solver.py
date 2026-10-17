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
