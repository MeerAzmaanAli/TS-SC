"""TS-SC solver microservice — FastAPI + OR-Tools CP-SAT."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import solver, substitution
from .schemas import (
    GenerateRequest,
    GenerateResponse,
    RankedCandidate,
    RankSubstitutesRequest,
    RankSubstitutesResponse,
    ResolveSubstitutesRequest,
    ResolveSubstitutesResponse,
)

app = FastAPI(title="TS-SC Solver", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/generate", response_model=GenerateResponse)
def generate(request: GenerateRequest) -> GenerateResponse:
    return solver.solve(request)


@app.post("/substitutions/rank", response_model=RankSubstitutesResponse)
def rank_substitutes(request: RankSubstitutesRequest) -> RankSubstitutesResponse:
    ranked = substitution.rank_candidates(
        requester_faculty_id=request.requester_faculty_id,
        section_faculty_ids=request.section_faculty_ids,
        course_faculty_ids=request.course_faculty_ids,
        busy_faculty_ids=set(request.busy_faculty_ids),
        all_faculty_ids=request.all_faculty_ids,
        faculty_loads=request.faculty_loads,
    )
    return RankSubstitutesResponse(
        candidates=[RankedCandidate(**c) for c in ranked]
    )


@app.post("/substitutions/resolve", response_model=ResolveSubstitutesResponse)
def resolve_substitutes(
    request: ResolveSubstitutesRequest,
) -> ResolveSubstitutesResponse:
    states = [c.model_dump() for c in request.candidates]
    should = substitution.should_resolve_now(states, request.deadline_passed)
    winner = substitution.resolve(states) if should else None
    penalties = substitution.penalise(states) if should else []
    return ResolveSubstitutesResponse(
        winner_faculty_id=winner,
        should_resolve=should,
        penalties=penalties,
    )
