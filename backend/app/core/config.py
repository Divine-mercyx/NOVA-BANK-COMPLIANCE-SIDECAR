from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    app_name: str = "Nova Compliance — Regulatory Reporting"
    app_version: str = "1.0.0"
    debug: bool = True

    database_url: str = "postgresql+asyncpg://nova:nova_dev@localhost:5433/nova_staging"
    sync_database_url: str = "postgresql+psycopg2://nova:nova_dev@localhost:5433/nova_staging"
    redis_url: str = "redis://localhost:6380/0"

    finacle_mode: str = "csv"
    finacle_oracle_dsn: str = ""
    finacle_oracle_user: str = ""
    finacle_oracle_password: str = ""
    # Finacle DB users often use 10G password verifiers — requires thick mode (Instant Client).
    finacle_oracle_thick_mode: bool = False
    finacle_oracle_client_lib_dir: str = ""
    finacle_oracle_default_days: int = 1
    finacle_schema: str = "CUSTOM"
    finacle_admin_schema: str = "TBAADM"
    finacle_oracle_source: str = "htd"
    finacle_samples_dir: str = "finacle_samples"
    finacle_customer_names_csv: str = "CUSTOMER_NAMES.csv"
    finacle_customer_table: str = "TBAADM.GAM"
    reports_output_dir: str = "reports_output"
    ctr_threshold_ngn: float = 5_000_000.0
    ftr_threshold_usd: float = 10_000.0

    api_base_url: str = "http://localhost:8000"

    etl_schedule_enabled: bool = False
    etl_schedule_hour: int = 2
    etl_schedule_minute: int = 0

    jwt_secret: str = "nova-dev-secret-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 480
    otp_expire_minutes: int = 10
    admin_email: str = "admin@novabank.ng"
    admin_password: str = "Admin@Nova2026"


settings = Settings()
