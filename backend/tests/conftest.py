"""Shared test setup.

NOVA_TEST_DATABASE_URL (a scratch PostgreSQL database, e.g. postgresql://nova:nova_dev@localhost:5432/nova_test)
turns on the tests that run against a real database. It must be applied before the app reads its settings,
which is why it is done here. Those tests drop and recreate every table in that database.
"""

import os

_TEST_DB = os.environ.get("NOVA_TEST_DATABASE_URL")
if _TEST_DB:
    _base = _TEST_DB.split("://", 1)[1]
    os.environ["DATABASE_URL"] = f"postgresql+asyncpg://{_base}"
    os.environ["SYNC_DATABASE_URL"] = f"postgresql+psycopg2://{_base}"
