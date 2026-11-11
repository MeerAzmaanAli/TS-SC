"""Substitution matching engine (Phase 5).

Flow (user-defined):
  1. A faculty member raises a substitution request for one of their sessions.
  2. Candidates are ranked and capped per tier:
       P1 — every free faculty already teaching in that section
       P2 — at most 4 free faculty teaching the same course (lowest weekly load first)
       P3 — at most 4 other free faculty (lowest weekly load first)
     The requester and anyone busy in the slot are excluded.
  3. The request fans out to candidates with a deadline of 10 minutes after
     the lecture starts.
  4. If several candidates accept, the highest compatibility wins
     (P1 > P2 > P3); ties break on lowest weekly load, then earliest response.
  5. If nobody accepts by the deadline, the lecture is marked free and
     students are notified.
  6. Rejections and timeouts are recorded as penalties for admin review.

The pure functions below are deliberately DB-free so they can be unit-tested;
the FastAPI endpoints in main.py expose them over HTTP.
"""

from __future__ import annotations


MAX_P2_CANDIDATES = 4
MAX_P3_CANDIDATES = 4


def rank_candidates(
    *,
    requester_faculty_id: str,
    section_faculty_ids: list[str],
    course_faculty_ids: list[str],
    busy_faculty_ids: set[str],
    all_faculty_ids: list[str],
    faculty_loads: dict[str, int],
) -> list[dict]:
    """Rank substitute candidates by compatibility (P1 > P2 > P3) with caps on P2/P3.

    - P1: all free faculty teaching in the section
    - P2: up to 4 free faculty teaching the same course (lowest load first)
    - P3: up to 4 other free faculty (lowest load first)
    """
    section_set = set(section_faculty_ids)
    course_set = set(course_faculty_ids)
    p1: list[dict] = []
    p2: list[dict] = []
    p3: list[dict] = []

    for fid in all_faculty_ids:
        if fid == requester_faculty_id or fid in busy_faculty_ids:
            continue
        load = faculty_loads.get(fid, 0)
        if fid in section_set:
            p1.append({"faculty_id": fid, "priority": 1, "weekly_load": load})
        elif fid in course_set:
            p2.append({"faculty_id": fid, "priority": 2, "weekly_load": load})
        else:
            p3.append({"faculty_id": fid, "priority": 3, "weekly_load": load})

    p1.sort(key=lambda c: c["weekly_load"])
    p2.sort(key=lambda c: c["weekly_load"])
    p3.sort(key=lambda c: c["weekly_load"])

    return p1 + p2[:MAX_P2_CANDIDATES] + p3[:MAX_P3_CANDIDATES]


def resolve(candidates: list[dict]) -> str | None:
    """Pick the winner among candidates who accepted.

    Each candidate: {faculty_id, priority, response, responded_at, weekly_load}.
    Returns the winning faculty_id, or None when nobody accepted.
    """
    accepted = [c for c in candidates if c.get("response") == "accepted"]
    if not accepted:
        return None
    accepted.sort(
        key=lambda c: (
            c["priority"],
            c.get("weekly_load", 0),
            c.get("responded_at") or "",
        )
    )
    return accepted[0]["faculty_id"]


def should_resolve_now(candidates: list[dict], deadline_passed: bool) -> bool:
    """Decide whether the request can be finalised right now.

    Resolve when the deadline has passed, or as soon as any candidate
    accepts the substitution request.
    """
    if deadline_passed:
        return True
    return any(c.get("response") == "accepted" for c in candidates)


def penalise(candidates: list[dict]) -> list[dict]:
    """Return penalty records for rejections and timeouts."""
    penalties = []
    for c in candidates:
        if c.get("response") == "rejected":
            penalties.append({"faculty_id": c["faculty_id"], "reason": "rejected"})
        elif c.get("response") in ("pending", "timed_out"):
            penalties.append({"faculty_id": c["faculty_id"], "reason": "timed_out"})
    return penalties
