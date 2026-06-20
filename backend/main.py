import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.routes import router as api_router
from core.rate_limit import limiter, HAS_SLOWAPI

app = FastAPI(
    title="Dhanaṁ Engine API",
    description="Backend for automated equity research and institutional valuation.",
    version="1.0.0"
)

# ---- Strict CORS ----
# Production: set ALLOWED_ORIGINS to your exact Vercel URL(s), comma-separated,
#   e.g. ALLOWED_ORIGINS=https://dhanam-three.vercel.app
# When that env var is present we allow ONLY those origins (rejecting everything
# else). Localhost is used solely as a fallback for local development when the
# env var is unset — it never widens the policy in production.
_env_origins = [o.strip().rstrip("/") for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]
allowed_origins = _env_origins if _env_origins else ["http://localhost:5173", "http://localhost:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,                 # explicit allow-list, never "*"
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    max_age=600,
)

# ---- Rate limiting (slowapi) ----
# Register the shared limiter + the 429 handler. Guarded so a missing/broken
# slowapi install degrades to no-op limits instead of crashing the server.
app.state.limiter = limiter
if HAS_SLOWAPI:
    from slowapi import _rate_limit_exceeded_handler
    from slowapi.errors import RateLimitExceeded
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.include_router(api_router, prefix="/api/v1")


@app.on_event("startup")
def _startup():
    # Eagerly initialize Firebase so the first auth request isn't penalised.
    # Non-fatal: if credentials are absent the public routes still work; only
    # auth/watchlist endpoints will return 503 until creds are provided.
    try:
        from services.firebase_client import init_firebase
        init_firebase()
        print("[Dhanam] Firebase Admin initialized.")
    except Exception as e:
        print(f"[Dhanam] Firebase not initialized (auth/watchlist disabled): {e}")


@app.get("/")
def health_check():
    return {"status": "operational", "engine": "Dhanaṁ Backend"}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))   # Render injects $PORT
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
