"""
KYCortex AI — Face Verification Routes
POST /face/verify — validates face confidence score from client.
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from services import face_service
from utils.helpers import decode_base64_image

router = APIRouter(prefix="/face", tags=["Face"])


class FaceVerifyRequest(BaseModel):
    confidence: float       # 0–100 from MediaPipe
    image: Optional[str] = None  # optional base64 image
    session_id: Optional[str] = None


@router.post("/verify")
async def verify_face(body: FaceVerifyRequest):
    """
    Verify face detection confidence score.
    confidence: float from 0 to 100 (MediaPipe score * 100)
    """
    image = None
    if body.image:
        try:
            image = decode_base64_image(body.image)
        except Exception:
            pass

    result = face_service.verify_face(body.confidence, image)
    return result
