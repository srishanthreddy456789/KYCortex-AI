"""
KYCortex AI — Session Service
In-memory session store for KYC verification state.
"""
import time
from typing import Optional
from utils.helpers import generate_session_id


# In-memory session store: session_id -> session_data
_sessions: dict = {}

KYC_STEPS = [
    "welcome",
    "face_check",
    "request_id",
    "id_processing",
    "confirm",
    "done",
]


def create_session() -> dict:
    """Create a new KYC session and return it."""
    session_id = generate_session_id()
    session = {
        "session_id": session_id,
        "created_at": time.time(),
        "step": "welcome",
        "face_verified": False,
        "face_confidence": 0.0,
        "id_captured": False,
        "ocr_result": None,
        "loan_eligible": None,
        "status": "in_progress",
    }
    _sessions[session_id] = session
    return session


def get_session(session_id: str) -> Optional[dict]:
    """Retrieve a session by ID."""
    return _sessions.get(session_id)


def update_session(session_id: str, **kwargs) -> Optional[dict]:
    """Update fields in a session."""
    session = _sessions.get(session_id)
    if session is None:
        return None
    session.update(kwargs)
    return session


def advance_step(session_id: str) -> Optional[str]:
    """Move session to next step. Returns new step name."""
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
    """Delete a session."""
    if session_id in _sessions:
        del _sessions[session_id]
        return True
    return False


def list_sessions() -> list:
    """List all active sessions (for debugging)."""
    return list(_sessions.keys())
