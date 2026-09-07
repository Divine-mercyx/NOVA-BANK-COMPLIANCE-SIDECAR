"""Run Alembic migrations on application startup."""

from __future__ import annotations

import logging
from pathlib import Path

from alembic import command
from alembic.config import Config

logger = logging.getLogger("nova.migrate")


def run_migrations() -> None:
    backend_root = Path(__file__).resolve().parents[2]
    alembic_ini = backend_root / "alembic.ini"
    if not alembic_ini.is_file():
        logger.warning("alembic.ini not found — skipping migrations")
        return
    cfg = Config(str(alembic_ini))
    cfg.set_main_option("script_location", str(backend_root / "alembic"))
    command.upgrade(cfg, "head")
    logger.info("Database migrations applied")
