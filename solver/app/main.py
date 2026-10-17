"""TS-SC solver microservice — FastAPI + OR-Tools CP-SAT."""

from fastapi import FastAPI

from . import solver
from .schemas import GenerateRequest, GenerateResponse

app = FastAPI(title="TS-SC Solver", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/generate", response_model=GenerateResponse)
def generate(request: GenerateRequest) -> GenerateResponse:
    return solver.solve(request)
