"""Tests Bloque 1: Login y Seguridad."""
from app.core import branding

ADMIN_EMAIL = branding.admin_email()
ADMIN_PASSWORD = CambiaEstaClave123
SPECIAL_CODE = branding.special_access_code()


def test_login_success(client):
    res = client.post("/api/v1/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD,
    })
    assert res.status_code == 200
    assert "access_token" in res.json()


def test_login_wrong_password(client):
    res = client.post("/api/v1/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": "wrong",
    })
    assert res.status_code == 401


def test_verify_special_code_correct(client, admin_headers):
    res = client.post(
        "/api/v1/auth/verify-special-code",
        json={"code": SPECIAL_CODE, "action": "test"},
        headers=admin_headers,
    )
    assert res.status_code in (200, 429)  # 429 si rate limit
    if res.status_code == 200:
        assert res.json()["ok"] is True


def test_verify_special_code_incorrect(client, admin_headers):
    res = client.post(
        "/api/v1/auth/verify-special-code",
        json={"code": "WRONG-CODE-12345"},
        headers=admin_headers,
    )
    assert res.status_code in (403, 429)


def test_verify_special_code_unauthenticated(client):
    res = client.post(
        "/api/v1/auth/verify-special-code",
        json={"code": "anything"},
    )
    assert res.status_code in (401, 429)


def test_change_special_code_requires_current(client, admin_headers):
    """No se debe poder cambiar el código sin el actual."""
    res = client.post(
        "/api/v1/auth/change-special-code",
        json={"current_code": "WRONG", "new_code": "NEW123"},
        headers=admin_headers,
    )
    assert res.status_code in (403, 429)
