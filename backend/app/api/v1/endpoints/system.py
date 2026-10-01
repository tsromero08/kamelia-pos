from datetime import datetime, date
from fastapi import APIRouter
from app.core.config import settings
from app.core import branding

router = APIRouter()


@router.get("/branding")
def get_branding():
    """
    Branding del restaurante para el frontend.
    Permite mostrar nombre/NIT/dirección sin tener que recompilar el bundle.
    """
    return branding.all_branding()


def _license_status() -> dict:
    """Calcula el estado de la licencia desde settings."""
    expires_raw = (settings.LICENSE_EXPIRES or "").strip()
    valid = True
    days_remaining = None
    expires = None
    if expires_raw:
        try:
            expires = date.fromisoformat(expires_raw)
            days_remaining = (expires - date.today()).days
            valid = days_remaining >= 0
        except ValueError:
            valid = False
    return {
        "valid": valid,
        "client": settings.LICENSE_CLIENT,
        "key": settings.LICENSE_KEY,
        "expires": expires.isoformat() if expires else None,
        "days_remaining": days_remaining,
        "vendor": "Software Titanova",
        "contact": settings.LICENSE_CONTACT,
        "slogan": "Soluciones inteligentes, negocios en movimiento",
    }


@router.get("/license")
def get_license():
    """Devuelve el estado de la licencia (público para banners de UI)."""
    return _license_status()


@router.get("/info")
def system_info():
    """Información de marca y sistema."""
    return {
        "system": f"{branding.business_name()} POS",
        "vendor": "Software Titanova",
        "vendor_phone": "3013896861",
        "slogan": "Soluciones inteligentes, negocios en movimiento",
        "version": "1.1.0",
        "server_time": datetime.now().isoformat(),
        "license": _license_status(),
    }
