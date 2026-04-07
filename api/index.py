import sys
import os

# Ensure backend is in path for Vercel Functions
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

# Import and export the FastAPI app from backend
from backend.main import app

# This is the entry point that Vercel recognizes
__all__ = ['app']


