"""Tests for the substitution matching engine (Phase 5)."""

from app.substitution import penalise, rank_candidates, resolve, should_resolve_now


def _rank(**overrides):
    kwargs = dict(
        requester_faculty_id="req",
        section_faculty_ids=["s1", "s2"],
        course_faculty_ids=["c1"],
        busy_faculty_ids=set(),
        all_faculty_ids=["req", "s1", "s2", "c1", "o1", "o2"],
        faculty_loads={"s1": 12, "s2": 8, "c1": 10, "o1": 5, "o2": 15},
    )
    kwargs.update(overrides)
    return rank_candidates(**kwargs)


def test_priority_ordering():
    ranked = _rank()
    by_id = {c["faculty_id"]: c["priority"] for c in ranked}
    assert by_id["s1"] == 1
    assert by_id["s2"] == 1
    assert by_id["c1"] == 2
    assert by_id["o1"] == 3
    # within P1, lower load first
    p1 = [c["faculty_id"] for c in ranked if c["priority"] == 1]
    assert p1 == ["s2", "s1"]


def test_requester_and_busy_excluded():
    ranked = _rank(busy_faculty_ids={"s1", "o1"})
    ids = [c["faculty_id"] for c in ranked]
    assert "req" not in ids
    assert "s1" not in ids
    assert "o1" not in ids
    assert "s2" in ids


def test_resolve_picks_highest_priority():
    cands = [
        {"faculty_id": "o1", "priority": 3, "response": "accepted",
         "responded_at": "2026-10-17T09:00:00", "weekly_load": 5},
        {"faculty_id": "c1", "priority": 2, "response": "accepted",
         "responded_at": "2026-10-17T09:05:00", "weekly_load": 10},
        {"faculty_id": "s2", "priority": 1, "response": "accepted",
         "responded_at": "2026-10-17T09:10:00", "weekly_load": 8},
    ]
    assert resolve(cands) == "s2"


def test_resolve_tie_breaks_on_load_then_time():
    cands = [
        {"faculty_id": "s1", "priority": 1, "response": "accepted",
         "responded_at": "2026-10-17T09:00:00", "weekly_load": 12},
        {"faculty_id": "s2", "priority": 1, "response": "accepted",
         "responded_at": "2026-10-17T09:05:00", "weekly_load": 8},
    ]
    assert resolve(cands) == "s2"  # lower load wins despite later response


def test_resolve_none_accepted():
    cands = [
        {"faculty_id": "s1", "priority": 1, "response": "rejected",
         "responded_at": "2026-10-17T09:00:00", "weekly_load": 12},
        {"faculty_id": "s2", "priority": 1, "response": "pending",
         "responded_at": None, "weekly_load": 8},
    ]
    assert resolve(cands) is None


def test_should_resolve_now():
    p1_accept = [
        {"faculty_id": "s1", "priority": 1, "response": "accepted",
         "responded_at": "2026-10-17T09:00:00", "weekly_load": 12},
    ]
    assert should_resolve_now(p1_accept, deadline_passed=False) is True

    p3_accept = [
        {"faculty_id": "o1", "priority": 3, "response": "accepted",
         "responded_at": "2026-10-17T09:00:00", "weekly_load": 5},
    ]
    assert should_resolve_now(p3_accept, deadline_passed=False) is False
    assert should_resolve_now(p3_accept, deadline_passed=True) is True


def test_penalise():
    cands = [
        {"faculty_id": "a", "priority": 1, "response": "rejected"},
        {"faculty_id": "b", "priority": 2, "response": "pending"},
        {"faculty_id": "c", "priority": 2, "response": "accepted"},
    ]
    pens = penalise(cands)
    assert {"faculty_id": "a", "reason": "rejected"} in pens
    assert {"faculty_id": "b", "reason": "timed_out"} in pens
    assert all(p["faculty_id"] != "c" for p in pens)
