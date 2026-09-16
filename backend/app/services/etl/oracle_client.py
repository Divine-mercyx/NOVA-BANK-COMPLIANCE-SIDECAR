"""Oracle client bootstrap — enables thick mode when Finacle uses 10G password verifiers."""

from __future__ import annotations

import logging

from app.core.config import settings

logger = logging.getLogger(__name__)
_initialized = False

# Seconds for TCP handshake. Call timeout is applied via call_timeout (ms) after connect —
# python-oracledb 2.x does not accept connect(..., timeout=...).
TCP_CONNECT_TIMEOUT_SEC = 25
CALL_TIMEOUT_MS = 180_000


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


def connect_oracle(oracledb, *, apply_call_timeout: bool = False, **kwargs):
    """Open a session using kwargs this python-oracledb version actually supports.

    Do not set call_timeout on HTD extracts — a 3-minute cap kills VPN joins with ORA-03135.
    """
    params = dict(kwargs)
    params.pop("timeout", None)
    params.setdefault("user", settings.finacle_oracle_user)
    params.setdefault("password", settings.finacle_oracle_password)
    params.setdefault("dsn", settings.finacle_oracle_dsn)

    try:
        conn = oracledb.connect(
            tcp_connect_timeout=TCP_CONNECT_TIMEOUT_SEC,
            expire_time=1,
            **params,
        )
    except TypeError:
        try:
            conn = oracledb.connect(tcp_connect_timeout=TCP_CONNECT_TIMEOUT_SEC, **params)
        except TypeError:
            conn = oracledb.connect(**params)

    if apply_call_timeout and hasattr(conn, "call_timeout"):
        conn.call_timeout = CALL_TIMEOUT_MS
    return conn
