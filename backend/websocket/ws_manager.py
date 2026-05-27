"""
KYCortex AI — WebSocket Manager
Manages active WebSocket connections mapped by session_id.
"""
import json
from typing import Dict
from fastapi import WebSocket


class WebSocketManager:
    def __init__(self):
        # session_id -> WebSocket
        self.active: Dict[str, WebSocket] = {}

    async def connect(self, session_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active[session_id] = websocket

    def disconnect(self, session_id: str):
        self.active.pop(session_id, None)

    async def send_json(self, session_id: str, data: dict):
        ws = self.active.get(session_id)
        if ws:
            try:
                await ws.send_text(json.dumps(data))
            except Exception:
                self.disconnect(session_id)

    async def broadcast(self, data: dict):
        for sid, ws in list(self.active.items()):
            try:
                await ws.send_text(json.dumps(data))
            except Exception:
                self.disconnect(sid)

    def is_connected(self, session_id: str) -> bool:
        return session_id in self.active


# Singleton instance shared across all routes
ws_manager = WebSocketManager()
