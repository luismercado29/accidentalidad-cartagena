import sys
import os

# Debug environment
print(f"[DEBUG] Current working directory: {os.getcwd()}")
print(f"[DEBUG] Python path: {sys.path[:2]}")
print(f"[DEBUG] Environment variables count: {len(os.environ)}")
db_url = os.getenv("DATABASE_URL")
if db_url:
    print(f"[DEBUG] DATABASE_URL is set: {db_url.split('@')[0]}@...")
else:
    print(f"[DEBUG] DATABASE_URL is NOT set")

# Ensure backend is in path for Vercel Functions
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

# Import and export the FastAPI app from backend
try:
    from backend.main import app
    print("[DEBUG] FastAPI app imported successfully")
except Exception as import_err:
    print(f"[ERROR] Failed to import app: {import_err}")
    import traceback
    traceback.print_exc()
    raise

# Vercel Function handler
handler = app


