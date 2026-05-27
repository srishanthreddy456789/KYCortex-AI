"""
KYCortex AI — Utility helpers
"""
import base64
import io
import uuid
import re
import numpy as np
from PIL import Image, ImageFilter


def generate_session_id() -> str:
    """Generate a unique session ID."""
    return f"KYC-{uuid.uuid4().hex[:12].upper()}"


def decode_base64_image(b64_str: str) -> Image.Image:
    """
    Decode a base64 encoded image string (with or without data URI prefix)
    and return a PIL Image.
    """
    # Strip data URI prefix if present
    if "," in b64_str:
        b64_str = b64_str.split(",", 1)[1]

    # Fix padding
    padding = 4 - len(b64_str) % 4
    if padding != 4:
        b64_str += "=" * padding

    image_bytes = base64.b64decode(b64_str)
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    return image


def preprocess_image(img: Image.Image) -> Image.Image:
    """
    Preprocess an image for better OCR accuracy:
    - Convert to grayscale
    - Upscale if small
    - Apply sharpening
    - Apply thresholding via numpy
    """
    import cv2

    # Convert PIL → numpy (BGR)
    cv_img = np.array(img)
    cv_img = cv2.cvtColor(cv_img, cv2.COLOR_RGB2BGR)

    # Grayscale
    gray = cv2.cvtColor(cv_img, cv2.COLOR_BGR2GRAY)

    # Upscale if image is small
    h, w = gray.shape
    if w < 800:
        scale = 800 / w
        gray = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)

    # Denoise
    denoised = cv2.fastNlMeansDenoising(gray, h=10, templateWindowSize=7, searchWindowSize=21)

    # Adaptive thresholding — better for varying illumination
    thresh = cv2.adaptiveThreshold(
        denoised, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY, 31, 10
    )

    # Deskew
    thresh = _deskew(thresh)

    return Image.fromarray(thresh)


def _deskew(img: np.ndarray) -> np.ndarray:
    """Deskew an image using Hough transform to detect text angle."""
    import cv2

    try:
        coords = np.column_stack(np.where(img < 128))
        if len(coords) < 10:
            return img
        angle = cv2.minAreaRect(coords.astype(np.float32))[-1]
        if angle < -45:
            angle = 90 + angle
        if abs(angle) < 0.5:
            return img
        (h, w) = img.shape[:2]
        center = (w // 2, h // 2)
        M = cv2.getRotationMatrix2D(center, angle, 1.0)
        rotated = cv2.warpAffine(
            img, M, (w, h),
            flags=cv2.INTER_CUBIC,
            borderMode=cv2.BORDER_REPLICATE
        )
        return rotated
    except Exception:
        return img


def clean_text(text: str) -> str:
    """Clean up OCR output text."""
    # Remove special chars but keep letters, digits, spaces, common punctuation
    text = re.sub(r"[^\w\s\-/:.,@]", " ", text)
    # Collapse multiple whitespace
    text = re.sub(r"\s+", " ", text).strip()
    return text
