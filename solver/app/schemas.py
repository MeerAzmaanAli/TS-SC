"""Pydantic contracts for the solver microservice (Phase 3)."""

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class GenerateRequest(BaseModel):
    institution_id: str
    entities: dict[str, Any] = Field(default_factory=dict)
    constraints: list[dict[str, Any]] = Field(default_factory=list)


class GenerateResponse(BaseModel):
    status: Literal["ok", "infeasible", "not_implemented"]
    message: Optional[str] = None
    version: Optional[dict[str, Any]] = None
    entries: list[dict[str, Any]] = Field(default_factory=list)
    violations: list[dict[str, Any]] = Field(default_factory=list)
    causes: list[dict[str, Any]] = Field(default_factory=list)
