"""Substitution matching engine (Phase 5).

Flow (user-defined):
  1. A faculty member raises a substitution request for one of their sessions.
  2. Candidates are ranked:
       P1 — faculty already teaching in that section AND free in the slot
       P2 — faculty teaching the same course AND free in the slot
       P3 — other faculty, free in the slot
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


def rank_candidates(
    *,
    requester_faculty_id: str,
    section_faculty_ids: list[str],
    course_faculty_ids: list[str],
    busy_faculty_ids: set[str],
    all_faculty_ids: list[str],
    faculty_loads: dict[str, int],
) -> list[dict]:
    """Rank substitute candidates by compatibility (P1 > P2 > P3)."""
    section_set = set(section_faculty_ids)
    course_set = set(course_faculty_ids)
    ranked: list[dict] = []
    for fid in all_faculty_ids:
        if fid == requester_faculty_id or fid in busy_faculty_ids:
            continue
        if fid in section_set:
            priority = 1
        elif fid in course_set:
            priority = 2
        else:
            priority = 3
        ranked.append(
            {
                "faculty_id": fid,
                "priority": priority,
                "weekly_load": faculty_loads.get(fid, 0),
            }
        )
    ranked.sort(key=lambda c: (c["priority"], c["weekly_load"]))
    return ranked


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

    Resolve when the deadline has passed, or as soon as a P1 candidate
    accepts (no later acceptance can beat P1 compatibility).
    """
    if deadline_passed:
        return True
    return any(
        c.get("response") == "accepted" and c.get("priority") == 1
        for c in candidates
    )


def penalise(candidates: list[dict]) -> list[dict]:
    """Return penalty records for rejections and timeouts."""
    penalties = []
    for c in candidates:
        if c.get("response") == "rejected":
            penalties.append({"faculty_id": c["faculty_id"], "reason": "rejected"})
        elif c.get("response") in ("pending", "timed_out"):
            penalties.append({"faculty_id": c["faculty_id"], "reason": "timed_out"})
    return penalties
