"""
KYCortex AI — Face Verification Service
Validates face detection confidence from the client-side MediaPipe results.
"""
from PIL import Image
from typing import Optional


CONFIDENCE_THRESHOLD = 60.0  # minimum % confidence to consider face "verified"


def verify_face(confidence: float, image: Optional[Image.Image] = None) -> dict:
    """
    Verify whether a face is detected with sufficient confidence.
    
    Args:
        confidence: float — confidence score (0-100) from MediaPipe
        image: optional PIL image for server-side checks (future use)
    
    Returns:
        dict with verified, confidence, message
    """
    verified = confidence >= CONFIDENCE_THRESHOLD

    if verified:
        message = f"Face verified with {confidence:.1f}% confidence."
        status = "verified"
    elif confidence > 0:
        message = (
            f"Face partially detected ({confidence:.1f}%). "
            "Please ensure your full face is visible and well lit."
        )
        status = "low_confidence"
    else:
        message = "No face detected. Please position your face in the camera frame."
        status = "not_detected"

    return {
        "verified": verified,
        "confidence": round(confidence, 1),
        "message": message,
        "status": status,
    }
