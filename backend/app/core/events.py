"""Live change notifications for the portal.

When a database commit touches a watched table, a small message naming what changed (a topic and
row ids, never row data) is published on a Redis channel. Every API process relays those messages
to its connected browsers over ``/api/v1/ws``, and the browser refetches through the normal,
permission-checked REST endpoints. If Redis is unreachable the bus falls back to fanning out
in-process, which is correct for a single API process.
"""

from __future__ import annotations

import asyncio
import json
import logging

from redis import asyncio as aioredis
from sqlalchemy import event
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.entities import (
    AuditEvent,
    DtdPullRun,
    DtdSchedulerState,
    ExtractionLog,
    ExtractionRun,
    RegulatoryReport,
    ScreeningAlert,
)

logger = logging.getLogger("nova.events")

CHANNEL = "nova:events"
_PENDING_KEY = "nova_live_changes"
_MAX_IDS_PER_TOPIC = 50
_QUEUE_SIZE = 100

# Model -> (topic, function returning the id the browser cares about).
_WATCHED = {
    ExtractionRun: ("extraction.run", lambda o: o.id),
    ExtractionLog: ("extraction.log", lambda o: o.run_id),
    DtdPullRun: ("dtd.run", lambda o: o.id),
    DtdSchedulerState: ("dtd.state", lambda o: str(o.id)),
    AuditEvent: ("audit", lambda o: o.id),
    ScreeningAlert: ("screening.alert", lambda o: o.id),
    RegulatoryReport: ("report", lambda o: o.id),
}


class EventBus:
    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue[str]] = set()
        self._redis: aioredis.Redis | None = None
        self._redis_ok = False
        self._listener: asyncio.Task | None = None
        self._tasks: set[asyncio.Task] = set()

    async def start(self) -> None:
        self._redis = aioredis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_connect_timeout=2,
            health_check_interval=30,
        )
        self._listener = asyncio.create_task(self._listen(), name="nova-live-listener")

    async def stop(self) -> None:
        if self._listener:
            self._listener.cancel()
            try:
                await self._listener
            except asyncio.CancelledError:
                pass
        if self._redis:
            await self._redis.aclose()

    def subscribe(self) -> asyncio.Queue[str]:
        queue: asyncio.Queue[str] = asyncio.Queue(maxsize=_QUEUE_SIZE)
        self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue[str]) -> None:
        self._subscribers.discard(queue)

    @property
    def connected_clients(self) -> int:
        return len(self._subscribers)

    async def publish(self, message: dict) -> None:
        data = json.dumps(message, separators=(",", ":"))
        if self._redis is not None and self._redis_ok:
            try:
                await self._redis.publish(CHANNEL, data)
                return
            except Exception:  # noqa: BLE001 - any Redis failure falls back to local fan-out
                logger.warning("Redis publish failed; delivering live event in-process only")
                self._redis_ok = False
        self._fanout(data)

    def publish_soon(self, message: dict) -> None:
        """Schedule a publish from synchronous code running on the event loop (ORM hooks)."""
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        task = loop.create_task(self.publish(message))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    def _fanout(self, data: str) -> None:
        for queue in list(self._subscribers):
            try:
                queue.put_nowait(data)
            except asyncio.QueueFull:
                pass

    async def _listen(self) -> None:
        backoff = 1.0
        while True:
            pubsub = None
            try:
                assert self._redis is not None
                pubsub = self._redis.pubsub()
                await pubsub.subscribe(CHANNEL)
                self._redis_ok = True
                backoff = 1.0
                logger.info("Live events: subscribed to Redis channel %s", CHANNEL)
                async for message in pubsub.listen():
                    if message.get("type") == "message":
                        self._fanout(message["data"])
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001 - keep retrying; local fan-out covers the gap
                if self._redis_ok or backoff == 1.0:
                    logger.warning("Live events: Redis unavailable, using in-process delivery")
                self._redis_ok = False
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30.0)
            finally:
                if pubsub is not None:
                    try:
                        await pubsub.aclose()
                    except Exception:  # noqa: BLE001
                        pass


bus = EventBus()


def _collect(session: Session, _flush_context) -> None:
    pending: dict[str, set[str]] = session.info.setdefault(_PENDING_KEY, {})
    for obj in list(session.new) + list(session.dirty):
        watched = _WATCHED.get(type(obj))
        if not watched:
            continue
        topic, get_id = watched
        ids = pending.setdefault(topic, set())
        if len(ids) < _MAX_IDS_PER_TOPIC:
            value = get_id(obj)
            if value is not None:
                ids.add(str(value))


def _flush_pending(session: Session) -> None:
    pending: dict[str, set[str]] | None = session.info.pop(_PENDING_KEY, None)
    if pending:
        bus.publish_soon({"type": "change", "changes": {topic: sorted(ids) for topic, ids in pending.items()}})


def _discard_pending(session: Session) -> None:
    session.info.pop(_PENDING_KEY, None)


_installed = False


def install_change_listeners() -> None:
    """Hook every ORM session (AsyncSession wraps a sync Session) once per process."""
    global _installed
    if _installed:
        return
    event.listen(Session, "after_flush", _collect)
    event.listen(Session, "after_commit", _flush_pending)
    event.listen(Session, "after_soft_rollback", lambda session, _tx: _discard_pending(session))
    _installed = True
