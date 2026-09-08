"""Oracle client bootstrap — enables thick mode when Finacle uses 10G password verifiers."""

from __future__ import annotations

import logging

from app.core.config import settings

logger = logging.getLogger(__name__)
_initialized = False


def get_oracledb():
    """Return the oracledb module after optional thick-mode initialization."""
    import oracledb

    global _initialized
    if _initialized:
        return oracledb

    if settings.finacle_oracle_thick_mode:
        kwargs: dict[str, str] = {}
        if settings.finacle_oracle_client_lib_dir:
            kwargs["lib_dir"] = settings.finacle_oracle_client_lib_dir
        oracledb.init_oracle_client(**kwargs)
        logger.info(
            "Oracle thick mode enabled%s",
            f" (lib_dir={settings.finacle_oracle_client_lib_dir})"
            if settings.finacle_oracle_client_lib_dir
            else "",
        )

    _initialized = True
    return oracledb
