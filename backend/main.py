from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.routes import router as api_router

app = FastAPI(
    title="Dhanaṁ Engine API",
    description="Backend for automated equity research and institutional valuation.",
    version="1.0.0"
)

# Allow React/Next.js frontend to communicate with the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")

@app.get("/")
def health_check():
    return {"status": "operational", "engine": "Dhanaṁ Backend"}

if __name__ == "__main__":
    import uvicorn
    # Run the server locally on port 8000
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)