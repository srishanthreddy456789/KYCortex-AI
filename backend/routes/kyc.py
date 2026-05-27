"""
KYCortex AI — KYC Routes v2
New flow: Welcome → Aadhaar capture → PAN capture → Face verify → Confirm → Done
Each document step retries up to 3 times before giving a final error.
"""
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel

from services import session_service, llm_service, face_service, ocr_service
from websocket.ws_manager import ws_manager
from utils.helpers import decode_base64_image

router = APIRouter(prefix="/kyc", tags=["KYC"])

MAX_RETRIES = 3  # max re-capture attempts per document


# ─────────────────────────────────────────────────────────────────────────────
#  REST endpoints
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/start")
async def start_session():
    session = session_service.create_session()
    return {
        "session_id": session["session_id"],
        "step": session["step"],
        "message": llm_service.get_agent_message("welcome"),
    }


@router.get("/status/{session_id}")
async def get_status(session_id: str):
    session = session_service.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "session_id": session["session_id"],
        "step": session["step"],
        "status": session["status"],
        "aadhaar_verified": session.get("aadhaar_verified"),
        "pan_verified": session.get("pan_verified"),
        "face_verified": session.get("face_verified"),
        "aadhaar_data": session.get("aadhaar_data"),
        "pan_data": session.get("pan_data"),
    }


# ─────────────────────────────────────────────────────────────────────────────
#  Helper: send agent message
# ─────────────────────────────────────────────────────────────────────────────
async def _say(session_id: str, step: str, msg_type: str = "AGENT_MESSAGE",
               extra: dict = None, ocr_data=None):
    payload = {
        "type": msg_type,
        "step": step,
        "message": llm_service.get_agent_message(step, ocr_data),
        "speak": True,          # frontend should TTS this
    }
    if extra:
        payload.update(extra)
    await ws_manager.send_json(session_id, payload)


async def _step_change(session_id: str, step: str, ocr_data=None, extra: dict = None):
    payload = {
        "type": "STEP_CHANGE",
        "step": step,
        "message": llm_service.get_agent_message(step, ocr_data),
        "speak": True,
    }
    if extra:
        payload.update(extra)
    await ws_manager.send_json(session_id, payload)


# ─────────────────────────────────────────────────────────────────────────────
#  WebSocket — AI agent
# ─────────────────────────────────────────────────────────────────────────────
@router.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """
    WebSocket KYC agent — new 3-step flow.

    Events FROM frontend:
      { type: "ID_CAPTURED",  doc_type: "aadhaar"|"pan", image: "<base64>" }
      { type: "FACE_UPDATE",  confidence: 0.0-1.0 }
      { type: "USER_MESSAGE", text: "..." }
      { type: "SUBMIT_KYC" }

    Events TO frontend:
      { type: "STEP_CHANGE",   step, message, speak }
      { type: "AGENT_MESSAGE", step, message, speak }
      { type: "OCR_RESULT",    doc_type, data }
      { type: "RETRY_REQUEST", step, message, speak, retries_left }
      { type: "FACE_STATUS",   verified, confidence }
      { type: "ERROR",         message }
    """
    session = session_service.get_session(session_id)
    if not session:
        await websocket.accept()
        await websocket.send_text(json.dumps({
            "type": "ERROR",
            "message": "Session not found. Please refresh and start again.",
        }))
        await websocket.close()
        return

    await ws_manager.connect(session_id, websocket)

    # ── Welcome ──────────────────────────────────────────────────────────────
    await _say(session_id, "welcome", "AGENT_MESSAGE")

    # ── Step 1: Ask for Aadhaar ───────────────────────────────────────────────
    session_service.set_step(session_id, "request_aadhaar")
    await _step_change(session_id, "request_aadhaar")

    face_verified_notified = False  # avoid duplicate face-step messages

    try:
        while True:
            raw  = await websocket.receive_text()
            data = json.loads(raw)
            etype = data.get("type", "")

            session = session_service.get_session(session_id)
            current_step = session.get("step", "welcome")

            # ── ID_CAPTURED ─────────────────────────────────────────────────
            if etype == "ID_CAPTURED":
                doc_type  = data.get("doc_type", "").lower()   # "aadhaar" or "pan"
                b64_image = data.get("image", "")

                if not b64_image:
                    await ws_manager.send_json(session_id, {
                        "type": "ERROR",
                        "message": "No image received. Please try again.",
                        "speak": True,
                    })
                    continue

                # ── Aadhaar ──────────────────────────────────────────────
                if doc_type == "aadhaar" or current_step in ("request_aadhaar", "aadhaar_processing"):
                    session_service.set_step(session_id, "aadhaar_processing")
                    await _step_change(session_id, "aadhaar_processing")

                    try:
                        img    = decode_base64_image(b64_image)
                        result = ocr_service.extract_aadhaar(img)
                    except Exception as e:
                        result = {"valid": False, "error": str(e)}

                    retries = session.get("aadhaar_retries", 0)

                    if result.get("valid"):
                        # Success ✅
                        session_service.update_session(
                            session_id,
                            aadhaar_captured=True,
                            aadhaar_verified=True,
                            aadhaar_data=result,
                            aadhaar_retries=0,
                        )
                        await ws_manager.send_json(session_id, {
                            "type": "OCR_RESULT",
                            "doc_type": "aadhaar",
                            "data": result,
                            "speak": False,
                        })
                        # Check for missing name
                        if result.get("missing_fields"):
                            await _say(session_id, "aadhaar_missing_field")
                        else:
                            await _say(session_id, "aadhaar_success")

                        # Advance to PAN
                        session_service.set_step(session_id, "request_pan")
                        await _step_change(session_id, "request_pan")

                    else:
                        # Failure — retry or abort
                        retries += 1
                        session_service.update_session(session_id,
                            aadhaar_retries=retries,
                            step="request_aadhaar",
                        )
                        retries_left = MAX_RETRIES - retries
                        if retries_left > 0:
                            retry_msg = llm_service.get_agent_message("aadhaar_retry")
                            await ws_manager.send_json(session_id, {
                                "type": "RETRY_REQUEST",
                                "step": "request_aadhaar",
                                "doc_type": "aadhaar",
                                "message": retry_msg,
                                "retries_left": retries_left,
                                "speak": True,
                            })
                        else:
                            # Max retries reached — still allow user to try but warn
                            session_service.update_session(session_id, aadhaar_retries=0)
                            await ws_manager.send_json(session_id, {
                                "type": "RETRY_REQUEST",
                                "step": "request_aadhaar",
                                "doc_type": "aadhaar",
                                "message": "I still cannot read your Aadhaar clearly. "
                                           "Please ensure the full card is in frame with good lighting, "
                                           "and try once more.",
                                "retries_left": MAX_RETRIES,
                                "speak": True,
                            })

                # ── PAN ──────────────────────────────────────────────────────
                elif doc_type == "pan" or current_step in ("request_pan", "pan_processing"):
                    session_service.set_step(session_id, "pan_processing")
                    await _step_change(session_id, "pan_processing")

                    try:
                        img    = decode_base64_image(b64_image)
                        result = ocr_service.extract_pan(img)
                    except Exception as e:
                        result = {"valid": False, "error": str(e)}

                    retries = session.get("pan_retries", 0)

                    if result.get("valid"):
                        session_service.update_session(
                            session_id,
                            pan_captured=True,
                            pan_verified=True,
                            pan_data=result,
                            pan_retries=0,
                        )
                        await ws_manager.send_json(session_id, {
                            "type": "OCR_RESULT",
                            "doc_type": "pan",
                            "data": result,
                            "speak": False,
                        })
                        if result.get("missing_fields"):
                            await _say(session_id, "pan_missing_field")
                        else:
                            await _say(session_id, "pan_success")

                        # Advance to Face
                        session_service.set_step(session_id, "request_face")
                        await _step_change(session_id, "request_face")
                        face_verified_notified = False

                    else:
                        retries += 1
                        session_service.update_session(session_id,
                            pan_retries=retries,
                            step="request_pan",
                        )
                        retries_left = MAX_RETRIES - retries
                        if retries_left > 0:
                            retry_msg = llm_service.get_agent_message("pan_retry")
                        else:
                            retry_msg  = ("I still cannot read your PAN. Please try again with "
                                          "the card fully visible and no glare.")
                            session_service.update_session(session_id, pan_retries=0)
                            retries_left = MAX_RETRIES

                        await ws_manager.send_json(session_id, {
                            "type": "RETRY_REQUEST",
                            "step": "request_pan",
                            "doc_type": "pan",
                            "message": retry_msg,
                            "retries_left": retries_left,
                            "speak": True,
                        })

                else:
                    await ws_manager.send_json(session_id, {
                        "type": "ERROR",
                        "message": "Unexpected document capture at this step.",
                    })

            # ── FACE_UPDATE ──────────────────────────────────────────────────
            elif etype == "FACE_UPDATE":
                confidence   = float(data.get("confidence", 0)) * 100
                face_result  = face_service.verify_face(confidence)
                session_service.update_session(session_id,
                    face_confidence=confidence,
                    face_verified=face_result["verified"],
                )

                if current_step in ("request_face", "face_check"):
                    if face_result["verified"] and not face_verified_notified:
                        face_verified_notified = True
                        session_service.set_step(session_id, "confirm")
                        # Build combined OCR data
                        combined = {
                            "aadhaar": session.get("aadhaar_data") or {},
                            "pan":     session.get("pan_data") or {},
                        }
                        await _say(session_id, "face_verified")
                        await _step_change(session_id, "confirm", ocr_data=combined,
                                           extra={"aadhaar": session.get("aadhaar_data"),
                                                  "pan":     session.get("pan_data")})
                    elif not face_result["verified"]:
                        face_verified_notified = False
                        await ws_manager.send_json(session_id, {
                            "type": "FACE_STATUS",
                            "verified": False,
                            "confidence": round(confidence, 1),
                        })

            # ── USER_MESSAGE ─────────────────────────────────────────────────
            elif etype == "USER_MESSAGE":
                text = (data.get("text") or "").strip().lower()
                # Smart replies based on step
                if current_step == "request_aadhaar":
                    await _say(session_id, "request_aadhaar")
                elif current_step == "request_pan":
                    await _say(session_id, "request_pan")
                elif current_step in ("request_face", "face_check"):
                    await _say(session_id, "request_face")
                else:
                    reply = llm_service.get_agent_message("user_reply")
                    await ws_manager.send_json(session_id, {
                        "type": "AGENT_MESSAGE",
                        "step": current_step,
                        "message": reply,
                        "speak": True,
                    })

            # ── SUBMIT_KYC ───────────────────────────────────────────────────
            elif etype == "SUBMIT_KYC":
                session_service.set_step(session_id, "done")
                session_service.update_session(session_id, status="submitted")
                await _step_change(session_id, "done")

    except WebSocketDisconnect:
        ws_manager.disconnect(session_id)
    except Exception:
        ws_manager.disconnect(session_id)
