"""
KYCortex AI — KYC Routes
Handles: session start, session status, and WebSocket AI agent.
"""
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel

from services import session_service, llm_service, face_service, ocr_service
from websocket.ws_manager import ws_manager
from utils.helpers import decode_base64_image

router = APIRouter(prefix="/kyc", tags=["KYC"])


# --------------------------------------------------------------------------- #
#  REST endpoints
# --------------------------------------------------------------------------- #
@router.post("/start")
async def start_session():
    """Create a new KYC session. Returns session_id and welcome message."""
    session = session_service.create_session()
    welcome = llm_service.get_agent_message("welcome")
    return {
        "session_id": session["session_id"],
        "step": session["step"],
        "message": welcome,
    }


@router.get("/status/{session_id}")
async def get_status(session_id: str):
    """Get the current status and step of a KYC session."""
    session = session_service.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "session_id": session["session_id"],
        "step": session["step"],
        "status": session["status"],
        "face_verified": session["face_verified"],
        "id_captured": session["id_captured"],
        "ocr_result": session.get("ocr_result"),
        "loan_eligible": session.get("loan_eligible"),
    }


# --------------------------------------------------------------------------- #
#  WebSocket — real-time AI agent
# --------------------------------------------------------------------------- #
@router.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for real-time KYC agent interaction.

    Events received FROM frontend:
      { "type": "FACE_UPDATE", "confidence": 0.72 }
      { "type": "ID_CAPTURED", "image": "<base64>" }
      { "type": "USER_MESSAGE", "text": "..." }
      { "type": "SUBMIT_KYC" }

    Events sent TO frontend:
      { "type": "AGENT_MESSAGE", "message": "...", "step": "..." }
      { "type": "OCR_RESULT", "data": {...} }
      { "type": "STEP_CHANGE", "step": "..." }
      { "type": "ERROR", "message": "..." }
    """
    # Validate session
    session = session_service.get_session(session_id)
    if not session:
        await websocket.accept()
        await websocket.send_text(json.dumps({
            "type": "ERROR",
            "message": "Session not found. Please refresh and start again."
        }))
        await websocket.close()
        return

    await ws_manager.connect(session_id, websocket)

    # Send welcome message immediately on connect
    await ws_manager.send_json(session_id, {
        "type": "AGENT_MESSAGE",
        "step": "welcome",
        "message": llm_service.get_agent_message("welcome"),
    })

    # Advance to face_check step
    session_service.advance_step(session_id)
    await ws_manager.send_json(session_id, {
        "type": "STEP_CHANGE",
        "step": "face_check",
        "message": llm_service.get_agent_message("face_check"),
    })

    try:
        while True:
            raw = await websocket.receive_text()
            data = json.loads(raw)
            event_type = data.get("type", "")

            # ---- FACE_UPDATE ------------------------------------------------
            if event_type == "FACE_UPDATE":
                confidence = float(data.get("confidence", 0)) * 100
                result = face_service.verify_face(confidence)
                session_service.update_session(
                    session_id,
                    face_confidence=confidence,
                    face_verified=result["verified"],
                )
                # Only advance if face just got verified and we're still on face_check
                session = session_service.get_session(session_id)
                if result["verified"] and session["step"] == "face_check":
                    session_service.advance_step(session_id)  # → request_id
                    await ws_manager.send_json(session_id, {
                        "type": "STEP_CHANGE",
                        "step": "request_id",
                        "message": llm_service.get_agent_message("request_id"),
                    })
                elif not result["verified"] and session["step"] == "face_check":
                    # Periodic reminder only (don't spam — client handles throttling)
                    await ws_manager.send_json(session_id, {
                        "type": "FACE_STATUS",
                        "verified": False,
                        "confidence": round(confidence, 1),
                    })

            # ---- ID_CAPTURED -----------------------------------------------
            elif event_type == "ID_CAPTURED":
                session = session_service.get_session(session_id)
                b64_image = data.get("image", "")
                if not b64_image:
                    await ws_manager.send_json(session_id, {
                        "type": "ERROR",
                        "message": "No image received. Please try capturing again.",
                    })
                    continue

                # Processing notification
                session_service.update_session(session_id, step="id_processing", id_captured=True)
                await ws_manager.send_json(session_id, {
                    "type": "STEP_CHANGE",
                    "step": "id_processing",
                    "message": llm_service.get_agent_message("id_processing"),
                })

                try:
                    image = decode_base64_image(b64_image)
                    ocr_result = ocr_service.extract_fields(image)
                    session_service.update_session(session_id, ocr_result=ocr_result)

                    if ocr_result.get("error"):
                        await ws_manager.send_json(session_id, {
                            "type": "AGENT_MESSAGE",
                            "step": "ocr_failed",
                            "message": llm_service.get_agent_message("ocr_failed"),
                        })
                    else:
                        # Send extracted data
                        await ws_manager.send_json(session_id, {
                            "type": "OCR_RESULT",
                            "data": ocr_result,
                        })
                        session_service.advance_step(session_id)  # → confirm
                        await ws_manager.send_json(session_id, {
                            "type": "STEP_CHANGE",
                            "step": "confirm",
                            "message": llm_service.get_agent_message("confirm", ocr_result),
                        })
                except Exception as e:
                    await ws_manager.send_json(session_id, {
                        "type": "ERROR",
                        "message": f"Failed to process image: {str(e)}",
                    })

            # ---- SUBMIT_KYC ------------------------------------------------
            elif event_type == "SUBMIT_KYC":
                session_service.advance_step(session_id)  # → done
                session_service.update_session(session_id, status="submitted")
                await ws_manager.send_json(session_id, {
                    "type": "STEP_CHANGE",
                    "step": "done",
                    "message": llm_service.get_agent_message("done"),
                })

            # ---- USER_MESSAGE ----------------------------------------------
            elif event_type == "USER_MESSAGE":
                session = session_service.get_session(session_id)
                step = session.get("step", "welcome")
                await ws_manager.send_json(session_id, {
                    "type": "AGENT_MESSAGE",
                    "step": step,
                    "message": llm_service.get_step_message(step),
                })

    except WebSocketDisconnect:
        ws_manager.disconnect(session_id)
    except Exception as e:
        ws_manager.disconnect(session_id)
