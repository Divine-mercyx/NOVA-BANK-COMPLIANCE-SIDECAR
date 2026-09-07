from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.auth import router as auth_router
from app.api.routes.compliance import router as compliance_router
from app.api.routes.integration import partner_router, router as integration_router
from app.api.routes.screening import router as screening_router
from app.core.config import settings
from app.core.database import Base, engine
from app.db.migrate import run_migrations
from app.models import entities  # noqa: F401
from app.seed.bootstrap import seed_database
from app.services.etl.scheduler import start_etl_scheduler, stop_etl_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    run_migrations()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await seed_database()
    start_etl_scheduler()
    yield
    stop_etl_scheduler()


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(compliance_router)
app.include_router(screening_router)
app.include_router(integration_router)
app.include_router(partner_router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "nova-compliance-m1"}
