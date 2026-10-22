"""Two-way live channel for the staff portal.

The socket only carries change hints (topic + ids) from app.core.events; the browser refetches the
data itself through the permission-checked REST API, so nothing sensitive crosses the socket.
"""

import asyncio
import json
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status

from app.api.deps import user_from_session_token
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.events import bus

router = APIRouter(prefix="/api/v1", tags=["live"])

HEARTBEAT_SECONDS = 25
CLOSE_UNAUTHORISED = 4401
CLOSE_FORBIDDEN_ORIGIN = 4403


@router.websocket("/ws")
async def live_socket(websocket: WebSocket) -> None:
    if websocket.headers.get("origin") not in settings.cors_origins:
        await websocket.close(code=CLOSE_FORBIDDEN_ORIGIN)
        return

    async with AsyncSessionLocal() as db:
        resolved = await user_from_session_token(websocket.cookies.get(settings.session_cookie_name), db)
    if not resolved:
        await websocket.close(code=CLOSE_UNAUTHORISED)
        return
    _user, payload = resolved
    expires_at = float(payload.get("exp", 0))

    await websocket.accept()
    queue = bus.subscribe()

    async def pump_events() -> None:
        await websocket.send_json({"type": "ready"})
        while True:
            if time.time() >= expires_at:
                await websocket.close(code=CLOSE_UNAUTHORISED)
                return
            try:
                data = await asyncio.wait_for(queue.get(), timeout=HEARTBEAT_SECONDS)
            except asyncio.TimeoutError:
                await websocket.send_json({"type": "ping"})
                continue
            await websocket.send_text(data)

    async def read_client() -> None:
        while True:
            message = await websocket.receive_text()
            try:
                if json.loads(message).get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
            except (ValueError, AttributeError):
                continue

    tasks = {asyncio.create_task(pump_events()), asyncio.create_task(read_client())}
    try:
        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in pending:
            task.cancel()
        for task in done:
            exc = task.exception()
            if exc and not isinstance(exc, (WebSocketDisconnect, RuntimeError)):
                raise exc
    except WebSocketDisconnect:
        pass
    finally:
        for task in tasks:
            task.cancel()
        bus.unsubscribe(queue)
        if websocket.client_state.name == "CONNECTED":
            try:
                await websocket.close(code=status.WS_1000_NORMAL_CLOSURE)
            except RuntimeError:
                pass
