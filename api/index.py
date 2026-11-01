import os
import sys

# Add the solver root directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "solver")))

from app.main import app as solver_app
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Create wrapper application
app = FastAPI(title="TS-SC Unified API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Support both /api/* and direct routes seamlessly on Vercel
app.mount("/api", solver_app)
app.mount("", solver_app)
