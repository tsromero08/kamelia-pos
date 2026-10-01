"""
Multi-canal WebSocket manager — un canal por estación de cocina y por cola
de despacho. Permite que la pantalla de Parrilla solo reciba eventos de
Parrilla y no se sature con bebidas / entradas / etc.
"""
from fastapi import WebSocket
from typing import Dict, Set
import json
import asyncio


class MultiChannelManager:
    def __init__(self):
        self.channels: Dict[str, Set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, channel: str, websocket: WebSocket):
        await websocket.accept()
        async with self._lock:
            self.channels.setdefault(channel, set()).add(websocket)

    async def disconnect(self, channel: str, websocket: WebSocket):
        async with self._lock:
            if channel in self.channels:
                self.channels[channel].discard(websocket)
                if not self.channels[channel]:
                    del self.channels[channel]

    async def broadcast(self, channel: str, event_type: str, payload: dict = None):
        data = json.dumps({"type": event_type, "data": payload or {}})
        dead = []
        connections = list(self.channels.get(channel, set()))
        for ws in connections:
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            await self.disconnect(channel, ws)

    async def broadcast_many(self, channels: list[str], event_type: str, payload: dict = None):
        for ch in channels:
            await self.broadcast(ch, event_type, payload)


station_manager = MultiChannelManager()
dispatch_manager = MultiChannelManager()
