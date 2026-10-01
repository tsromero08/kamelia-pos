"""
Branding del restaurante. Lee restaurant.config.json (raíz del proyecto)
y expone los valores que usan endpoints, factura, exportador, etc.

Cualquier valor también puede venir por variable de entorno
(prefijo BRAND_), por ejemplo: BRAND_BUSINESS_NAME=Pizzeria Lupita.
Las env vars ganan sobre el JSON.
"""
from __future__ import annotations
import json
import os
from pathlib import Path
from functools import lru_cache


_DEFAULT = {
    "business": {
        "name": "Mi Restaurante",
        "short_name": "Restaurante",
        "tagline": "Sistema de Gestión POS",
        "type": "restaurante",
        "nit": "000000000-0",
        "phone": "0000000000",
        "address": "Dirección del restaurante",
        "city": "Ciudad",
        "country": "Colombia",
        "currency": "COP",
        "currency_symbol": "$",
    },
    "system": {
        "email_domain": "restaurante.local",
        "special_access_code": "ACCESS2026",
        "first_admin_password": "CambiaEstaClave123",
    },
    "license": {
        "key": "TITANOVA-DEMO",
        "client": "Cliente Demo",
        "expires": "",
        "contact": "Software Titanova - 3013896861",
    },
}


def _find_config() -> Path | None:
    here = Path(__file__).resolve()
    for parent in [here.parent, *here.parents]:
        candidate = parent / "restaurant.config.json"
        if candidate.exists():
            return candidate
    return None


@lru_cache(maxsize=1)
def _load() -> dict:
    cfg = {k: dict(v) for k, v in _DEFAULT.items()}
    path = _find_config()
    if path:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            for section in cfg:
                if section in data and isinstance(data[section], dict):
                    cfg[section].update(data[section])
        except Exception as e:
            print(f"[branding] no se pudo leer {path}: {e}")
    return cfg


def _env_override(section: str, key: str, default: str) -> str:
    env_key = f"BRAND_{section.upper()}_{key.upper()}"
    return os.getenv(env_key) or _load().get(section, {}).get(key, default)


# ─── API pública ────────────────────────────────────────────────────────
def business_name() -> str:
    return _env_override("business", "name", "Mi Restaurante")


def short_name() -> str:
    return _env_override("business", "short_name", "Restaurante")


def tagline() -> str:
    return _env_override("business", "tagline", "Sistema de Gestión POS")


def email_domain() -> str:
    return _env_override("system", "email_domain", "restaurante.local")


def admin_email() -> str:
    return f"admin@{email_domain()}"


def cashier_email() -> str:
    return f"cajero@{email_domain()}"


def kitchen_email() -> str:
    return f"cocina@{email_domain()}"


def waiter_email() -> str:
    return f"mesero@{email_domain()}"


def business_nit() -> str:
    return _env_override("business", "nit", "000000000-0")


def business_phone() -> str:
    return _env_override("business", "phone", "0000000000")


def business_address() -> str:
    return _env_override("business", "address", "Dirección del restaurante")


def license_key() -> str:
    return _env_override("license", "key", "TITANOVA-DEMO")


def license_client() -> str:
    return _env_override("license", "client", "Cliente Demo")


def license_contact() -> str:
    return _env_override("license", "contact", "Software Titanova - 3013896861")


def special_access_code() -> str:
    return _env_override("system", "special_access_code", "ACCESS2026")


def first_admin_password() -> str:
    return _env_override("system", "first_admin_password", "CambiaEstaClave123")


def all_branding() -> dict:
    """Devuelve un dict serializable para exponer al frontend vía API."""
    return {
        "name": business_name(),
        "short_name": short_name(),
        "tagline": tagline(),
        "nit": business_nit(),
        "phone": business_phone(),
        "address": business_address(),
        "license_client": license_client(),
        "license_contact": license_contact(),
    }
