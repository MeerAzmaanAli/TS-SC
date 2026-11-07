"""TS-SC solver microservice — FastAPI + OR-Tools CP-SAT."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import mailer, solver, substitution
from .schemas import (
    GenerateRequest,
    GenerateResponse,
    RankedCandidate,
    RankSubstitutesRequest,
    RankSubstitutesResponse,
    ResolveSubstitutesRequest,
    ResolveSubstitutesResponse,
    SendEmailRequest,
    SendEmailResponse,
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
    print(f"\n==================== /generate REQUEST RECEIVED ====================")
    print(f"Sections: {len(request.sections)}, Courses: {len(request.courses)}, Faculty: {len(request.faculty)}, Rooms: {len(request.rooms)}, Slots: {len(request.time_slots)}")
    print(f"Section-Courses: {len(request.section_courses)}, Qualifications: {len(request.qualifications)}")
    resp = solver.solve(request)
    print(f"==================== /generate FINISHED: status={resp.status}, causes={resp.causes} ====================\n")
    return resp


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


@app.post("/notifications/email", response_model=SendEmailResponse)
def send_notification_email(req: SendEmailRequest) -> SendEmailResponse:
    ok = mailer.send_email(
        to_email=req.to_email,
        to_name=req.to_name,
        subject=req.subject,
        body_html=req.body_html,
        body_text=req.body_text,
    )
    return SendEmailResponse(
        success=ok,
        message="Email sent successfully" if ok else "Failed to dispatch email",
    )
