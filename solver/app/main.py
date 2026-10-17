"""TS-SC solver microservice — FastAPI + OR-Tools CP-SAT."""

from fastapi import FastAPI

from .schemas import GenerateRequest, GenerateResponse

app = FastAPI(title="TS-SC Solver", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/generate", response_model=GenerateResponse)
def generate(request: GenerateRequest) -> GenerateResponse:
    # Phase 3 wires this to solver.solve(request).
    return GenerateResponse(
        status="not_implemented",
        message="Solver not yet implemented — see Phase 3 in docs/DEVELOPMENT_PLAN.md.",
    )
