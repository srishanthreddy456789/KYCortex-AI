"""
KYCortex AI — Agent/LLM Service
Step-based conversational AI agent for guiding the user through KYC verification.
No external LLM API required — uses a deterministic state machine with rich messages.
"""
from typing import Optional


# Step → list of messages the agent can say
AGENT_SCRIPT: dict[str, list[str]] = {
    "welcome": [
        "👋 Welcome to KYCortex AI! I'm Cortex, your AI verification assistant. "
        "Let's complete your KYC in just a few steps. Please ensure you're in a well-lit area.",
        "Hello! I'm Cortex, your KYC agent. I'll guide you through identity verification. "
        "Make sure your camera is on and your face is clearly visible.",
    ],
    "face_check": [
        "✅ Great — I can see your face clearly. Please stay still for a moment while I run liveness checks.",
        "📸 Face detected! Hold steady. I'm verifying your identity signals now.",
        "🔍 Liveness check in progress. Please look directly at the camera.",
    ],
    "request_id": [
        "🪪 Now, please hold your ID card (Aadhaar, PAN, Driving License, or Passport) "
        "clearly in front of the camera and click 'Capture ID'.",
        "📄 Almost there! Please present your government-issued ID to the camera. "
        "Make sure all text is visible and the document lies flat.",
    ],
    "id_processing": [
        "⏳ Analyzing your document... Please wait a moment.",
        "🔬 Running OCR extraction on your ID. This takes just a second.",
    ],
    "confirm": [
        "✅ Document verified successfully! I've extracted your details. "
        "Please review the information shown and click 'Submit KYC' to proceed.",
        "🎉 All checks passed! Your identity details have been extracted. "
        "Review and confirm to complete your KYC.",
    ],
    "done": [
        "🏁 KYC process complete! Your application has been submitted for review. "
        "You'll receive a confirmation shortly. Thank you for using KYCortex AI!",
        "✅ All done! Your KYC submission is under review. "
        "Loan eligibility results will be shared within 24 hours.",
    ],
    "face_not_detected": [
        "⚠️ I can't detect your face clearly. Please ensure:\n"
        "• Your face is fully visible and not obscured\n"
        "• The room is well lit\n"
        "• You're not too far from the camera",
    ],
    "ocr_success": [
        "✅ Document scanned successfully! I can see your details clearly.",
    ],
    "ocr_failed": [
        "❌ I had trouble reading your document. Please:\n"
        "• Hold the document flat and steady\n"
        "• Ensure good lighting with no glare\n"
        "• Make sure all text is visible\n"
        "Then try capturing again.",
    ],
    "loan_eligible": [
        "💰 Great news! Based on your profile, you appear to be eligible for loan products. "
        "Our team will reach out with personalized offers.",
    ],
    "error": [
        "⚠️ Something went wrong. Please try again or refresh the page.",
    ],
}

import random

def get_agent_message(step: str, ocr_data: Optional[dict] = None) -> str:
    """
    Get the appropriate AI agent message for the current step.
    If ocr_data is provided and step is 'confirm', include extracted fields.
    """
    messages = AGENT_SCRIPT.get(step, AGENT_SCRIPT["error"])
    msg = random.choice(messages)

    # Enhance confirm message with actual OCR data
    if step == "confirm" and ocr_data:
        fields = []
        if ocr_data.get("name"):
            fields.append(f"**Name:** {ocr_data['name']}")
        if ocr_data.get("dob"):
            fields.append(f"**Date of Birth:** {ocr_data['dob']}")
        if ocr_data.get("id_number"):
            fields.append(f"**ID Number:** {ocr_data['id_number']}")
        if ocr_data.get("document_type"):
            fields.append(f"**Document:** {ocr_data['document_type']}")
        if ocr_data.get("gender"):
            fields.append(f"**Gender:** {ocr_data['gender']}")
        if fields:
            msg += "\n\nExtracted details:\n" + "\n".join(fields)

    return msg


def get_step_message(step: str) -> str:
    """Simple alias — returns agent message for a given step."""
    return get_agent_message(step)
