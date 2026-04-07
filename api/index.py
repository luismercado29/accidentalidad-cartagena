import sys
import os

# Ensure backend is in path for Vercel Functions
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

try:
    from backend.main import app
except Exception as e:
    print(f"[ERROR] Failed to import backend app: {e}")
    # Fallback app
    from fastapi import FastAPI
    app = FastAPI()
    
    @app.get("/health")
    def health():
        return {
            "status": "error",
            "message": f"Backend initialization failed: {e}",
            "detail": "Check DATABASE_URL and other environment variables in Vercel Settings"
        }

