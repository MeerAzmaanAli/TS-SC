import os
import sys

# NOTE (2026-11-02 fix): the api service must NOT import the solver app.
# solver/app/main.py imports OR-Tools at module load, but OR-Tools is not
# installed for this service (api/requirements.txt has no ortools), so the
# import crashed every /api request with FUNCTION_INVOCATION_FAILED and
# broke faculty substitution dispatch (which calls /api/substitutions/rank).
# Instead, re-export the gateway app from main.py: it proxies /api/* to the
# solver service over the SOLVER_URL service binding injected by Vercel,
# and the solver service installs ortools from solver/requirements.txt.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from main import app

__all__ = ["app"]
