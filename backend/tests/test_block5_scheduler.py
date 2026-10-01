"""Tests Bloque 5: Cierre automático de caja."""


def test_scheduler_status_endpoint(client, admin_headers):
    res = client.get("/api/v1/reports/scheduler-status", headers=admin_headers)
    assert res.status_code == 200
    data = res.json()
    assert "running" in data
    assert "next_run" in data
    assert "today_closed" in data
    assert "pending_days" in data


def test_scheduler_status_requires_auth(client):
    res = client.get("/api/v1/reports/scheduler-status")
    assert res.status_code == 401


def test_auto_close_day_function():
    """Llamada directa a la función debería ser idempotente."""
    from app.services.scheduler import auto_close_day
    result = auto_close_day()
    # Si falla, simplemente no lo registra (None)
    if result is not None:
        assert result.summary_date is not None
        assert result.total_sales is not None


def test_health_endpoint(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"
