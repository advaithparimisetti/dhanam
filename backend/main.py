import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.routes import router as api_router

app = FastAPI(
    title="Dhanaṁ Engine API",
    description="Backend for automated equity research and institutional valuation.",
    version="1.0.0"
)

# CORS: localhost defaults for dev, plus any production origins from env.
# ALLOWED_ORIGINS is a comma-separated list, e.g.
#   https://dhanam.vercel.app,https://www.dhanam.app
_default_origins = ["http://localhost:3000", "http://localhost:5173"]
_env_origins = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]
allowed_origins = list(dict.fromkeys(_default_origins + _env_origins))  # de-duped, order-preserving

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
