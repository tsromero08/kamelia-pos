"""
Fixtures compartidos para los tests.
- Usa la BD existente (restaurant_pos.db) — los tests NO la destruyen
- Login con el admin generado desde restaurant.config.json
"""
import os
import sys
import pytest
from fastapi.testclient import TestClient

# Añadir el directorio backend al path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app
from app.core import branding

ADMIN_EMAIL = branding.admin_email()
ADMIN_PASSWORD = CambiaEstaClave123


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def admin_token(client):
    res = client.post("/api/v1/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD,
    })
    assert res.status_code == 200, f"Login admin falló: {res.text}"
    return res.json()["access_token"]


@pytest.fixture
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}
