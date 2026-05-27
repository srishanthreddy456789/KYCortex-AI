"""
KYCortex AI — OCR Routes
POST /ocr/extract — accepts a base64 image and returns extracted KYC fields.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services import ocr_service
from utils.helpers import decode_base64_image

router = APIRouter(prefix="/ocr", tags=["OCR"])


class ExtractRequest(BaseModel):
    image: str  # base64 encoded image (with or without data URI prefix)
    session_id: str | None = None


@router.post("/extract")
async def extract_document(body: ExtractRequest):
    """
    Extract structured fields from a base64-encoded document image.
    Returns: { document_type, name, dob, id_number, address, gender, pincode, raw_text, confidence }
    """
    if not body.image:
        raise HTTPException(status_code=400, detail="Image is required")

    try:
        image = decode_base64_image(body.image)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image data: {str(e)}")

    result = ocr_service.extract_fields(image)

    if result.get("error"):
        return {
            "success": False,
            "error": result["error"],
            "data": None,
        }

    return {
        "success": True,
        "error": None,
        "data": result,
    }
