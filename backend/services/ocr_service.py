"""
KYCortex AI — OCR Service v2
Dedicated extraction and validation for Aadhaar and PAN cards.
"""
import re
import os
import platform
from typing import Optional
from PIL import Image

# ── Tesseract setup ──────────────────────────────────────────────────────────
try:
    import pytesseract
    if platform.system() == "Windows":
        for p in [
            r"C:\Program Files\Tesseract-OCR\tesseract.exe",
            r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
            r"C:\Users\asus\AppData\Local\Programs\Tesseract-OCR\tesseract.exe",
        ]:
            if os.path.exists(p):
                pytesseract.pytesseract.tesseract_cmd = p
                break
    TESSERACT_AVAILABLE = True
except ImportError:
    TESSERACT_AVAILABLE = False

from utils.helpers import preprocess_image, clean_text


# ── Aadhaar validators ───────────────────────────────────────────────────────
AADHAAR_RE = re.compile(r"\b(\d{4}\s?\d{4}\s?\d{4})\b")
PAN_RE      = re.compile(r"\b([A-Z]{5}[0-9]{4}[A-Z])\b")
DOB_RE      = re.compile(
    r"(?:DOB|D\.O\.B|Date of Birth|Birth)[:\s/]*(\d{2}[\/\-]\d{2}[\/\-]\d{4})"
    r"|(\d{2}[\/\-]\d{2}[\/\-]\d{4})",
    re.IGNORECASE
)
NAME_SKIP = {
    "GOVERNMENT", "INDIA", "REPUBLIC", "AADHAAR", "PERMANENT",
    "ACCOUNT", "NUMBER", "DRIVING", "LICENSE", "LICENCE", "VOTER",
    "ELECTION", "COMMISSION", "PASSPORT", "INCOME", "TAX", "DEPARTMENT",
    "UNIQUE", "IDENTIFICATION", "AUTHORITY", "ENROLMENT",
}


def _run_ocr(image: Image.Image) -> tuple[str, float]:
    """Run Tesseract on the image, try multiple configs, return best (text, confidence)."""
    if not TESSERACT_AVAILABLE:
        return "", 0.0
    processed = preprocess_image(image)
    best_text, best_conf = "", 0.0
    for cfg in ["--oem 3 --psm 6", "--oem 3 --psm 3", "--oem 3 --psm 11"]:
        try:
            raw = pytesseract.image_to_string(processed, config=cfg, lang="eng")
            data = pytesseract.image_to_data(
                processed, config=cfg, lang="eng",
                output_type=pytesseract.Output.DICT
            )
            confs = [c for c in data["conf"] if isinstance(c, (int, float)) and c > 0]
            avg = sum(confs) / len(confs) if confs else 0
            if avg > best_conf:
                best_conf, best_text = avg, raw
        except Exception:
            continue
    return best_text, best_conf


def _extract_name(text: str) -> Optional[str]:
    # Named patterns
    for pat in [
        r"(?:Name|NAME)[:\s]+([A-Z][a-zA-Z\s]{2,40})",
        r"(?:नाम)[:\s]+([A-Za-z\s]{2,40})",
    ]:
        m = re.search(pat, text)
        if m:
            name = re.sub(r"\s+", " ", m.group(1).strip())
            if 3 <= len(name) <= 50 and not any(d.isdigit() for d in name):
                return name.title()
    # Heuristic: line with 2-4 all-alpha words not in skip list
    for line in text.splitlines():
        words = line.strip().split()
        if 2 <= len(words) <= 4:
            if all(w.replace(".", "").isalpha() and len(w) >= 2 for w in words):
                if not any(w.upper() in NAME_SKIP for w in words):
                    return " ".join(words).title()
    return None


def _extract_dob(text: str) -> Optional[str]:
    m = DOB_RE.search(text)
    if m:
        return (m.group(1) or m.group(2) or "").strip()
    # Year-only fallback
    m2 = re.search(r"(?:Year of Birth|YOB)[:\s]*(\d{4})", text, re.IGNORECASE)
    if m2:
        return m2.group(1)
    return None


def _extract_address(text: str) -> Optional[str]:
    for pat in [
        r"(?:Address|ADDRESS)[:\s]+([\s\S]{10,200}?)(?:\n\n|\Z|PIN)",
        r"(?:C/O|S/O|D/O|W/O)[,\s]+([\s\S]{10,150}?)(?:\n\n|\Z)",
    ]:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            addr = re.sub(r"\s+", " ", m.group(1).strip())
            if len(addr) > 10:
                return addr[:200]
    return None


def _extract_gender(text: str) -> Optional[str]:
    m = re.search(r"\b(Male|Female|MALE|FEMALE)\b", text, re.IGNORECASE)
    if m:
        return m.group(1).capitalize()
    return None


def _extract_pincode(text: str) -> Optional[str]:
    m = re.search(r"\b(\d{6})\b", text)
    return m.group(1) if m else None


# ── Public API ───────────────────────────────────────────────────────────────

def extract_aadhaar(image: Image.Image) -> dict:
    """
    Extract and validate Aadhaar card fields.
    Returns: { valid, id_number, name, dob, address, gender, pincode,
               raw_text, confidence, error? }
    """
    if not TESSERACT_AVAILABLE:
        return {"valid": False, "error": "Tesseract OCR not installed"}

    raw_text, conf = _run_ocr(image)
    if not raw_text.strip():
        return {"valid": False, "error": "no_text", "confidence": 0}

    # Find Aadhaar number
    m = AADHAAR_RE.search(raw_text)
    aadhaar_num = m.group(1).replace(" ", " ").strip() if m else None

    # Validate — needs 12 digits
    digits = re.sub(r"\s", "", aadhaar_num or "")
    is_valid = bool(aadhaar_num) and len(digits) == 12 and digits.isdigit()

    result = {
        "valid": is_valid,
        "id_number": aadhaar_num,
        "name": _extract_name(raw_text),
        "dob": _extract_dob(raw_text),
        "address": _extract_address(raw_text),
        "gender": _extract_gender(raw_text),
        "pincode": _extract_pincode(raw_text),
        "document_type": "Aadhaar Card",
        "raw_text": clean_text(raw_text),
        "confidence": round(conf, 1),
    }

    if not is_valid:
        result["error"] = "aadhaar_not_found" if not aadhaar_num else "aadhaar_invalid"

    # Flag missing critical fields even if Aadhaar found
    if is_valid and not result["name"]:
        result["missing_fields"] = ["name"]

    return result


def extract_pan(image: Image.Image) -> dict:
    """
    Extract and validate PAN card fields.
    Returns: { valid, id_number, name, dob, raw_text, confidence, error? }
    """
    if not TESSERACT_AVAILABLE:
        return {"valid": False, "error": "Tesseract OCR not installed"}

    raw_text, conf = _run_ocr(image)
    if not raw_text.strip():
        return {"valid": False, "error": "no_text", "confidence": 0}

    m = PAN_RE.search(raw_text)
    pan_num = m.group(1) if m else None

    is_valid = bool(pan_num) and bool(re.fullmatch(r"[A-Z]{5}[0-9]{4}[A-Z]", pan_num or ""))

    result = {
        "valid": is_valid,
        "id_number": pan_num,
        "name": _extract_name(raw_text),
        "dob": _extract_dob(raw_text),
        "document_type": "PAN Card",
        "raw_text": clean_text(raw_text),
        "confidence": round(conf, 1),
    }

    if not is_valid:
        result["error"] = "pan_not_found" if not pan_num else "pan_invalid"

    return result


def extract_fields(image: Image.Image) -> dict:
    """
    Generic extractor — tries to detect document type and extract.
    Used by the /ocr/extract REST endpoint.
    """
    if not TESSERACT_AVAILABLE:
        return {"error": "Tesseract OCR not installed", "raw_text": "", "confidence": 0}

    raw_text, conf = _run_ocr(image)
    if not raw_text.strip():
        return {"error": "Could not extract text from image.", "raw_text": "", "confidence": 0}

    text_up = raw_text.upper()
    if "AADHAAR" in text_up or "UIDAI" in text_up or AADHAAR_RE.search(raw_text):
        result = extract_aadhaar(image)
    elif PAN_RE.search(raw_text) or "PERMANENT ACCOUNT NUMBER" in text_up:
        result = extract_pan(image)
    else:
        # Generic
        result = {
            "document_type": "Identity Document",
            "name": _extract_name(raw_text),
            "dob": _extract_dob(raw_text),
            "id_number": None,
            "address": _extract_address(raw_text),
            "gender": _extract_gender(raw_text),
            "pincode": _extract_pincode(raw_text),
            "raw_text": clean_text(raw_text),
            "confidence": round(conf, 1),
            "valid": False,
        }

    result["tesseract_available"] = True
    return result
