"""CP-SAT timetable solver (implemented in Phase 3).

Planned model
-------------
One decision variable per required course session: (time_slot, room, faculty).

Hard constraints (must never be violated):
  - no faculty / room / section double-booked in the same slot
  - room capacity and type fit the course
  - assigned faculty is qualified for the course
  - faculty weekly load within its configured maximum
  - elective sessions only in reserved slot-blocks

Soft constraints (weighted objective):
  - minimise schedule gaps
  - spread a course's sessions across distinct days
  - balance faculty load

On infeasibility, return the unsatisfiable constraint set so the UI can
explain the specific cause (REQ-11).
"""

from .schemas import GenerateRequest, GenerateResponse


def solve(request: GenerateRequest) -> GenerateResponse:
    raise NotImplementedError("Solver lands in Phase 3 — see docs/DEVELOPMENT_PLAN.md")
