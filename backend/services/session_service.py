"""
KYCortex AI — Session Service v2
New KYC flow: welcome → request_aadhaar → aadhaar_processing → request_pan
              → pan_processing → request_face → face_check → confirm → done
"""
import time
from typing import Optional
from utils.helpers import generate_session_id

_sessions: dict = {}

KYC_STEPS = [
    "welcome",
    "request_aadhaar",
    "aadhaar_processing",
    "request_pan",
    "pan_processing",
    "request_face",
    "face_check",
    "confirm",
    "done",
]


def create_session() -> dict:
    session_id = generate_session_id()
    session = {
        "session_id": session_id,
        "created_at": time.time(),
        "step": "welcome",
        # Aadhaar
        "aadhaar_captured": False,
        "aadhaar_verified": False,
        "aadhaar_retries": 0,
        "aadhaar_data": None,
        # PAN
        "pan_captured": False,
        "pan_verified": False,
        "pan_retries": 0,
        "pan_data": None,
        # Face
        "face_verified": False,
        "face_confidence": 0.0,
        "face_retries": 0,
        # Overall
        "status": "in_progress",
        "loan_eligible": None,
    }
    _sessions[session_id] = session
    return session


def get_session(session_id: str) -> Optional[dict]:
    return _sessions.get(session_id)


def update_session(session_id: str, **kwargs) -> Optional[dict]:
    session = _sessions.get(session_id)
    if session is None:
        return None
    session.update(kwargs)
    return session


def set_step(session_id: str, step: str) -> Optional[dict]:
    """Set session to a specific step."""
    session = _sessions.get(session_id)
    if session:
        session["step"] = step
    return session


def advance_step(session_id: str) -> Optional[str]:
    session = _sessions.get(session_id)
    if session is None:
        return None
    current = session.get("step", "welcome")
    try:
        idx = KYC_STEPS.index(current)
        if idx < len(KYC_STEPS) - 1:
            next_step = KYC_STEPS[idx + 1]
            session["step"] = next_step
            return next_step
    except ValueError:
        pass
    return current


def delete_session(session_id: str) -> bool:
    if session_id in _sessions:
        del _sessions[session_id]
        return True
    return False
