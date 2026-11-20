import os
import sys

# Ensure solver directory and app package are on python sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.main import app

__all__ = ["app"]
