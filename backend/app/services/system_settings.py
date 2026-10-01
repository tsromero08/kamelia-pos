"""
Configuración runtime persistente en JSON (sin requerir tabla SQL).
Usado para el SPECIAL_ACCESS_CODE editable y otras claves del sistema
que el admin puede cambiar sin reiniciar el servidor.

Cae al valor de settings.* si no hay override en disco.
"""
import json
import os
import threading
from typing import Any
from app.core.config import settings

_LOCK = threading.RLock()
_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "data", "system_settings.json")
)

DEFAULTS: dict[str, Any] = {
    "special_access_code": settings.SPECIAL_ACCESS_CODE,
}

_cache: dict[str, Any] | None = None


def _ensure_dir():
    os.makedirs(os.path.dirname(_PATH), exist_ok=True)


def _load() -> dict[str, Any]:
    global _cache
    if _cache is not None:
        return _cache
    if not os.path.exists(_PATH):
        _cache = dict(DEFAULTS)
        return _cache
    try:
        with open(_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        merged = {**DEFAULTS, **data}
        _cache = merged
        return merged
    except Exception as e:
        print(f"[system_settings] no se pudo leer {_PATH}: {e}")
        _cache = dict(DEFAULTS)
        return _cache


def _save(data: dict[str, Any]):
    _ensure_dir()
    with open(_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def get(key: str, default: Any = None) -> Any:
    with _LOCK:
        return _load().get(key, default)


def set_value(key: str, value: Any):
    with _LOCK:
        data = _load()
        data[key] = value
        _save(data)
        global _cache
        _cache = data


def get_special_access_code() -> str:
    """Override > settings.SPECIAL_ACCESS_CODE."""
    return str(get("special_access_code", settings.SPECIAL_ACCESS_CODE) or "")
