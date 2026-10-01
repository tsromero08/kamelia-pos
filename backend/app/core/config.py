from pydantic_settings import BaseSettings
from typing import List
from app.core import branding


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./restaurant_pos.db"
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Default admin: usa el dominio del restaurant.config.json
    FIRST_ADMIN_EMAIL: str = branding.admin_email()
    FIRST_ADMIN_PASSWORD: str = branding.first_admin_password()
    FIRST_ADMIN_NAME: str = "Administrador"

    BACKEND_CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:80", "http://localhost"]

    # Inventory control
    BLOCK_SALE_ON_LOW_STOCK: bool = False

    # Modo debug: en False oculta /docs y /openapi.json
    DEBUG: bool = False

    # Código de Acceso Especial (acciones críticas: inventario, gastos, contabilidad)
    SPECIAL_ACCESS_CODE: str = branding.special_access_code()

    # Sistema de licencia (Software Titanova)
    LICENSE_KEY: str = branding.license_key()
    LICENSE_CLIENT: str = branding.license_client()
    LICENSE_EXPIRES: str = ""    # YYYY-MM-DD vacío = sin vencimiento
    LICENSE_CONTACT: str = branding.license_contact()

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
