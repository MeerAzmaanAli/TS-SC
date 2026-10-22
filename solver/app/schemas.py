"""Pydantic contracts for the solver microservice (Phase 3)."""

from typing import Literal, Optional

from pydantic import BaseModel, Field


class Section(BaseModel):
    id: str
    strength: int
    batch_count: int = 1


class Course(BaseModel):
    id: str
    sessions_per_week: int
    lab_required: bool = False
    is_elective: bool = False


class SectionCourse(BaseModel):
    section_id: str
    course_id: str
    sessions_per_week: Optional[int] = None


class Faculty(BaseModel):
    id: str
    max_weekly_load: int


class Room(BaseModel):
    id: str
    room_type: str = "classroom"
    capacity: int = 0


class TimeSlot(BaseModel):
    id: str
    day_of_week: int
    period: int


class Qualification(BaseModel):
    faculty_id: str
    course_id: str


class Weights(BaseModel):
    gap: float = 10.0
    spread: float = 5.0
    load: float = 5.0


class GenerateRequest(BaseModel):
    institution_id: str
    sections: list[Section] = Field(default_factory=list)
    courses: list[Course] = Field(default_factory=list)
    section_courses: list[SectionCourse] = Field(default_factory=list)
    faculty: list[Faculty] = Field(default_factory=list)
    rooms: list[Room] = Field(default_factory=list)
    time_slots: list[TimeSlot] = Field(default_factory=list)
    qualifications: list[Qualification] = Field(default_factory=list)
    elective_blocks: list[str] = Field(default_factory=list)
    weights: Weights = Field(default_factory=Weights)
    time_limit_seconds: float = 60.0


class TimetableEntry(BaseModel):
    section_id: str
    course_id: str
    faculty_id: str
    room_id: str
    time_slot_id: str
    is_elective: bool = False
    batch: Optional[int] = None


class GenerateResponse(BaseModel):
    status: Literal["ok", "infeasible", "not_implemented"]
    message: Optional[str] = None
    entries: list[TimetableEntry] = Field(default_factory=list)
    # Soft-constraint statistics for the Conflict Inspector.
    violations: dict[str, object] = Field(default_factory=dict)
    # Populated when status == "infeasible": the constraint groups whose
    # relaxation restores feasibility (see solver.diagnose()).
    causes: list[str] = Field(default_factory=list)


# ---------------- substitution (Phase 5) ----------------


class RankSubstitutesRequest(BaseModel):
    requester_faculty_id: str
    section_faculty_ids: list[str] = Field(default_factory=list)
    course_faculty_ids: list[str] = Field(default_factory=list)
    busy_faculty_ids: list[str] = Field(default_factory=list)
    all_faculty_ids: list[str] = Field(default_factory=list)
    faculty_loads: dict[str, int] = Field(default_factory=dict)


class RankedCandidate(BaseModel):
    faculty_id: str
    priority: int
    weekly_load: int


class RankSubstitutesResponse(BaseModel):
    candidates: list[RankedCandidate] = Field(default_factory=list)


class CandidateState(BaseModel):
    faculty_id: str
    priority: int
    response: str = "pending"
    responded_at: Optional[str] = None
    weekly_load: int = 0


class ResolveSubstitutesRequest(BaseModel):
    candidates: list[CandidateState] = Field(default_factory=list)
    deadline_passed: bool = False


class ResolveSubstitutesResponse(BaseModel):
    winner_faculty_id: Optional[str] = None
    should_resolve: bool = False
    penalties: list[dict[str, str]] = Field(default_factory=list)
