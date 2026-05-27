"""
KYCortex AI — Loan Eligibility Routes
POST /loan/check — basic eligibility check based on session KYC data.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from services import session_service

router = APIRouter(prefix="/loan", tags=["Loan"])


class LoanCheckRequest(BaseModel):
    session_id: str
    monthly_income: Optional[float] = None
    loan_amount: Optional[float] = None


@router.post("/check")
async def check_loan_eligibility(body: LoanCheckRequest):
    """
    Check basic loan eligibility for a completed KYC session.
    Returns eligibility status, max loan amount, and interest rate suggestion.
    """
    session = session_service.get_session(body.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.get("status") not in ("submitted", "in_progress"):
        raise HTTPException(
            status_code=400,
            detail="KYC must be completed before loan eligibility check"
        )

    # Basic eligibility logic
    face_ok = session.get("face_verified", False)
    id_ok = session.get("id_captured", False)
    ocr = session.get("ocr_result") or {}

    eligible = face_ok and id_ok and bool(ocr.get("name")) and bool(ocr.get("id_number"))

    if eligible:
        # Determine loan amount based on income (if provided)
        income = body.monthly_income or 30000  # default
        max_loan = income * 36
        emi = (max_loan * 0.01) / (1 - (1 + 0.01) ** -36)
        result = {
            "eligible": True,
            "max_loan_amount": round(max_loan, 2),
            "suggested_interest_rate": "10.5% p.a.",
            "emi_estimate": round(emi, 2),
            "tenure_options": ["12 months", "24 months", "36 months"],
            "message": "Congratulations! You're pre-qualified for a personal loan.",
            "kyc_score": 85 if ocr.get("address") else 70,
        }
    else:
        missing = []
        if not face_ok:
            missing.append("face verification")
        if not id_ok:
            missing.append("ID capture")
        if not ocr.get("name"):
            missing.append("name extraction")
        result = {
            "eligible": False,
            "max_loan_amount": 0,
            "message": f"Loan eligibility requires: {', '.join(missing)}.",
            "kyc_score": 0,
        }

    session_service.update_session(body.session_id, loan_eligible=result["eligible"])
    return result
