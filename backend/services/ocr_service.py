"""
KYCortex AI — OCR Service
Extracts structured fields from ID document images using pytesseract.
Supports: Aadhaar, PAN, Driving License, Passport, Voter ID
"""
import re
import sys
import platform
from typing import Optional
from PIL import Image

try:
    import pytesseract
    # Auto-detect Tesseract path on Windows
    if platform.system() == "Windows":
        import os
        common_paths = [
            r"C:\Program Files\Tesseract-OCR\tesseract.exe",
            r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
            r"C:\Users\asus\AppData\Local\Programs\Tesseract-OCR\tesseract.exe",
        ]
        for p in common_paths:
            if os.path.exists(p):
                pytesseract.pytesseract.tesseract_cmd = p
                break
    TESSERACT_AVAILABLE = True
except ImportError:
    TESSERACT_AVAILABLE = False

from utils.helpers import preprocess_image, clean_text


# --------------------------------------------------------------------------- #
#  Document type detection
# --------------------------------------------------------------------------- #
def _detect_document_type(text: str) -> str:
    text_up = text.upper()
    if re.search(r"\bAADHAAR\b|\bUIDAI\b|\bUID\b|\bAadhaar\b", text, re.IGNORECASE):
        return "Aadhaar Card"
    if re.search(r"\bPERMANENT ACCOUNT NUMBER\b|\bPAN\b|\bINCOME TAX\b", text_up):
        return "PAN Card"
    if re.search(r"\bDRIVING LICEN[CS]E\b|\bDL NO\b|\bD\.L\b", text_up):
        return "Driving License"
    if re.search(r"\bPASSPORT\b|\bREPUBLIC OF INDIA\b", text_up):
        return "Passport"
    if re.search(r"\bVOTER\b|\bELECTION COMMISSION\b|\bELECTOR\b", text_up):
        return "Voter ID"
    return "Identity Document"


# --------------------------------------------------------------------------- #
#  Field parsers
# --------------------------------------------------------------------------- #
def _extract_name(text: str, doc_type: str) -> Optional[str]:
    """Extract full name from OCR text."""
    patterns = [
        r"(?:Name|NAME)[:\s]+([A-Z][a-zA-Z\s]{2,40})",
        r"(?:नाम)[:\s]+([A-Za-z\s]{2,40})",
        # PAN card — name is typically on 4th line
        r"^([A-Z][A-Z\s]{5,30})$",
    ]
    for pat in patterns:
        m = re.search(pat, text, re.MULTILINE)
        if m:
            name = m.group(1).strip()
            name = re.sub(r"\s+", " ", name)
            if 3 <= len(name) <= 50 and not any(d.isdigit() for d in name):
                return name.title()
    # Fallback: find two consecutive capitalized words not part of known headers
    skip_words = {"GOVERNMENT", "INDIA", "REPUBLIC", "AADHAAR", "PERMANENT", "ACCOUNT",
                  "NUMBER", "DRIVING", "LICENSE", "LICENCE", "VOTER", "ELECTION",
                  "COMMISSION", "PASSPORT", "INCOME", "TAX", "DEPARTMENT"}
    lines = text.splitlines()
    for line in lines:
        line = line.strip()
        words = line.split()
        if 2 <= len(words) <= 4:
            if all(w.replace(".", "").isalpha() and len(w) >= 2 for w in words):
                if not any(w.upper() in skip_words for w in words):
                    return line.title()
    return None


def _extract_dob(text: str) -> Optional[str]:
    """Extract date of birth."""
    patterns = [
        r"(?:DOB|D\.O\.B|Date of Birth|Birth)[:\s/]*(\d{2}[\/\-]\d{2}[\/\-]\d{4})",
        r"(\d{2}[\/\-]\d{2}[\/\-]\d{4})",
        r"(\d{4}[\/\-]\d{2}[\/\-]\d{2})",
        r"(?:Year of Birth|YOB)[:\s]*(\d{4})",
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            return m.group(1).strip()
    return None


def _extract_id_number(text: str, doc_type: str) -> Optional[str]:
    """Extract the document ID number."""
    # Aadhaar: 12 digits in groups of 4
    m = re.search(r"\b(\d{4}\s\d{4}\s\d{4})\b", text)
    if m:
        return m.group(1)

    # PAN: ABCDE1234F
    m = re.search(r"\b([A-Z]{5}[0-9]{4}[A-Z])\b", text)
    if m:
        return m.group(1)

    # Passport: A1234567
    m = re.search(r"\b([A-Z]\d{7})\b", text)
    if m:
        return m.group(1)

    # Driving License: state code + digits
    m = re.search(r"\b([A-Z]{2}[-\s]?\d{2}[-\s]?\d{4,7})\b", text)
    if m:
        return m.group(1)

    # Generic: 8-16 digit number
    m = re.search(r"\b(\d{8,16})\b", text)
    if m:
        return m.group(1)

    return None


def _extract_address(text: str) -> Optional[str]:
    """Extract address block."""
    patterns = [
        r"(?:Address|ADDRESS|Addr)[:\s]+([\s\S]{10,200}?)(?:\n\n|\Z|(?:PIN|Pincode|PINCODE))",
        r"(?:C/O|S/O|D/O|W/O)[,\s]+([\s\S]{10,150}?)(?:\n\n|\Z)",
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            addr = m.group(1).strip()
            addr = re.sub(r"\s+", " ", addr)
            if len(addr) > 10:
                return addr[:200]
    return None


def _extract_gender(text: str) -> Optional[str]:
    """Extract gender."""
    m = re.search(r"\b(Male|Female|MALE|FEMALE|M|F)\b", text)
    if m:
        val = m.group(1).upper()
        if val in ("M", "MALE"):
            return "Male"
        if val in ("F", "FEMALE"):
            return "Female"
    return None


def _extract_pincode(text: str) -> Optional[str]:
    """Extract PIN code."""
    m = re.search(r"\b(\d{6})\b", text)
    if m:
        return m.group(1)
    return None


# --------------------------------------------------------------------------- #
#  Main extraction function
# --------------------------------------------------------------------------- #
def extract_fields(image: Image.Image) -> dict:
    """
    Run OCR on the given PIL image and extract structured KYC fields.
    Returns a dict with all extracted data.
    """
    if not TESSERACT_AVAILABLE:
        return {
            "error": "Tesseract OCR is not installed. Please install it from https://github.com/UB-Mannheim/tesseract/wiki",
            "raw_text": "",
            "confidence": 0,
        }

    # Preprocess for better accuracy
    processed = preprocess_image(image)

    # Run OCR with multiple configs and take best
    configs = [
        "--oem 3 --psm 6",   # Assume uniform text block
        "--oem 3 --psm 3",   # Fully automatic page segmentation
        "--oem 3 --psm 11",  # Sparse text
    ]

    best_text = ""
    best_conf = 0.0

    for cfg in configs:
        try:
            raw = pytesseract.image_to_string(processed, config=cfg, lang="eng")
            data = pytesseract.image_to_data(
                processed, config=cfg, lang="eng",
                output_type=pytesseract.Output.DICT
            )
            confs = [c for c in data["conf"] if isinstance(c, (int, float)) and c > 0]
            avg_conf = sum(confs) / len(confs) if confs else 0
            if avg_conf > best_conf:
                best_conf = avg_conf
                best_text = raw
        except Exception:
            continue

    if not best_text.strip():
        return {
            "error": "Could not extract text from image. Ensure the document is clearly visible.",
            "raw_text": "",
            "confidence": 0,
        }

    raw_text = clean_text(best_text)
    doc_type = _detect_document_type(best_text)

    name = _extract_name(best_text, doc_type)
    dob = _extract_dob(best_text)
    id_number = _extract_id_number(best_text, doc_type)
    address = _extract_address(best_text)
    gender = _extract_gender(best_text)
    pincode = _extract_pincode(best_text)

    return {
        "document_type": doc_type,
        "name": name,
        "dob": dob,
        "id_number": id_number,
        "address": address,
        "gender": gender,
        "pincode": pincode,
        "raw_text": raw_text,
        "confidence": round(best_conf, 1),
        "tesseract_available": True,
    }
