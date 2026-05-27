"""
KYCortex AI — FastAPI Application Entry Point
Run with: uvicorn app:app --reload --port 8000
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from routes import kyc, ocr, face, loan

# --------------------------------------------------------------------------- #
#  App Configuration
# --------------------------------------------------------------------------- #
app = FastAPI(
    title="KYCortex AI",
    description="AI-Powered Video KYC & Loan Onboarding Backend",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# --------------------------------------------------------------------------- #
#  CORS — allow frontend dev server origins
# --------------------------------------------------------------------------- #
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8080",
        "http://localhost:5173",
        "http://127.0.0.1:8080",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --------------------------------------------------------------------------- #
#  Register Routers
# --------------------------------------------------------------------------- #
app.include_router(kyc.router)
app.include_router(ocr.router)
app.include_router(face.router)
app.include_router(loan.router)


# --------------------------------------------------------------------------- #
#  Health Check
# --------------------------------------------------------------------------- #
@app.get("/health", tags=["Health"])
async def health_check():
    """Returns backend health status."""
    import platform
    import sys
    try:
        import pytesseract
        tess_version = pytesseract.get_tesseract_version()
        tesseract_ok = True
        tesseract_version = str(tess_version)
    except Exception as e:
        tesseract_ok = False
        tesseract_version = str(e)

    return {
        "status": "ok",
        "service": "KYCortex AI Backend",
        "version": "1.0.0",
        "python": sys.version,
        "platform": platform.system(),
        "tesseract_available": tesseract_ok,
        "tesseract_version": tesseract_version,
    }


@app.get("/", tags=["Root"])
async def root():
    return {
        "message": "KYCortex AI Backend is running 🚀",
        "docs": "/docs",
        "health": "/health",
        "endpoints": {
            "kyc_start": "POST /kyc/start",
            "kyc_status": "GET /kyc/status/{session_id}",
            "kyc_ws": "WS /kyc/ws/{session_id}",
            "ocr_extract": "POST /ocr/extract",
            "face_verify": "POST /face/verify",
            "loan_check": "POST /loan/check",
        }
    }
