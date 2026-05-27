"""
KYCortex AI — Agent/LLM Service (v2)
New flow: Welcome → Aadhaar → PAN → Face → Confirm → Done
Voice-friendly messages (no markdown symbols that TTS reads aloud).
Retry messages for each failed step.
"""
import random
from typing import Optional

# ---------------------------------------------------------------------------
# Agent Script — plain text, TTS-friendly (emoji stripped in voice mode on FE)
# ---------------------------------------------------------------------------
AGENT_SCRIPT: dict[str, list[str]] = {

    # ── Onboarding ──────────────────────────────────────────────────────────
    "welcome": [
        "Welcome to KYCortex AI! I am Cortex, your AI-powered KYC assistant. "
        "I will guide you through a quick 3-step identity check: "
        "first your Aadhaar card, then your PAN card, and finally a face scan. "
        "Let us begin. Please keep your documents ready and make sure you are in a well-lit area.",
    ],

    # ── Step 1 — Aadhaar ────────────────────────────────────────────────────
    "request_aadhaar": [
        "Step 1 of 3: Aadhaar Card. Please hold your Aadhaar card clearly in front of the camera "
        "so that all four lines of text are visible, then click Capture ID. "
        "You may also upload a photo of your Aadhaar using the Upload button.",
    ],
    "aadhaar_processing": [
        "Got it! Reading your Aadhaar card now. Please hold still for a moment.",
    ],
    "aadhaar_success": [
        "Perfect! Your Aadhaar card has been scanned successfully. "
        "I have extracted your name, date of birth, and Aadhaar number.",
    ],
    "aadhaar_retry": [
        "I could not read your Aadhaar card clearly. Please try again. "
        "Make sure the card is flat, fully visible, and there is no glare or shadow on it. "
        "All four rows of digits on the Aadhaar must be readable.",
        "Hmm, the Aadhaar scan was not clear. "
        "Please retake the photo with better lighting and make sure the full card fits in the frame.",
        "I was unable to detect a valid 12-digit Aadhaar number. "
        "Please capture the front face of your Aadhaar card and try again.",
    ],
    "aadhaar_missing_field": [
        "I scanned the card but could not read all the required fields. "
        "Could you please retake the photo ensuring the name, date of birth, "
        "and the 12-digit Aadhaar number are all clearly visible?",
    ],

    # ── Step 2 — PAN ────────────────────────────────────────────────────────
    "request_pan": [
        "Excellent! Step 2 of 3: PAN Card. Now please hold your PAN card in front of the camera. "
        "Make sure the 10-character PAN number and your name are clearly visible, "
        "then click Capture ID or Upload.",
    ],
    "pan_processing": [
        "Reading your PAN card now. Please keep still.",
    ],
    "pan_success": [
        "Your PAN card has been verified successfully. "
        "I have noted your PAN number and date of birth.",
    ],
    "pan_retry": [
        "I could not read your PAN card clearly. "
        "Please retake the photo. The 10-character PAN number like A B C D E 1 2 3 4 F must be visible.",
        "The PAN scan was not successful. "
        "Please ensure the card is well-lit, flat, and the text is not blurry or cut off.",
        "Hmm, I did not detect a valid PAN number. "
        "Please try capturing the PAN card again with the full card in frame.",
    ],
    "pan_missing_field": [
        "I could see the PAN card but the PAN number was not clear. "
        "Please retake the photo making sure the 10-character PAN number at the top is fully visible.",
    ],

    # ── Step 3 — Face ───────────────────────────────────────────────────────
    "request_face": [
        "Almost done! Step 3 of 3: Face Verification. "
        "Please look directly at the camera and hold still. "
        "I will automatically detect your face and verify your liveness. "
        "Make sure your face is fully visible and the room is well lit.",
    ],
    "face_check": [
        "I can see your face. Please hold still while I complete the liveness check.",
    ],
    "face_verified": [
        "Face verified! Your liveness check is complete.",
    ],
    "face_retry": [
        "I cannot detect your face clearly. "
        "Please make sure your full face is visible in the camera frame "
        "and the room is well lit. Remove any glasses or mask if possible.",
        "Face detection failed. Please position yourself so your face fills the center of the video frame "
        "and try again.",
        "I am having trouble seeing your face. "
        "Please check that your camera is on, face is centered, and lighting is good.",
    ],

    # ── Confirm & Done ───────────────────────────────────────────────────────
    "confirm": [
        "All three checks are complete! "
        "I have your Aadhaar details, PAN details, and your face has been verified. "
        "Please review the information shown on screen and click Submit KYC to finish.",
    ],
    "done": [
        "KYC process complete! Your application has been submitted for review. "
        "You will receive a confirmation shortly. Thank you for using KYCortex AI!",
    ],

    # ── Fallback ──────────────────────────────────────────────────────────────
    "user_reply": [
        "I understand. Let me continue guiding you.",
        "Sure! Let me know if you need any help.",
        "Got it. Please follow the instructions shown on screen.",
    ],
    "error": [
        "Something went wrong. Please try again or refresh the page.",
    ],
}


def get_agent_message(step: str, ocr_data: Optional[dict] = None, doc_type: Optional[str] = None) -> str:
    """
    Get the appropriate AI agent message for the current step.
    Optionally inject extracted OCR fields into confirm/success messages.
    """
    messages = AGENT_SCRIPT.get(step, AGENT_SCRIPT["error"])
    msg = random.choice(messages)

    # Inject OCR data into confirm message
    if step == "confirm" and ocr_data:
        fields = []
        if ocr_data.get("aadhaar", {}).get("name"):
            fields.append(f"Name: {ocr_data['aadhaar']['name']}")
        if ocr_data.get("aadhaar", {}).get("id_number"):
            fields.append(f"Aadhaar: {ocr_data['aadhaar']['id_number']}")
        if ocr_data.get("pan", {}).get("id_number"):
            fields.append(f"PAN: {ocr_data['pan']['id_number']}")
        if ocr_data.get("aadhaar", {}).get("dob"):
            fields.append(f"Date of Birth: {ocr_data['aadhaar']['dob']}")
        if fields:
            msg += " Here is what I captured: " + ", ".join(fields) + "."

    return msg


def get_step_message(step: str) -> str:
    """Simple alias."""
    return get_agent_message(step)
