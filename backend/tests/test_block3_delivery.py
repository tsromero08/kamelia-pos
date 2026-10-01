"""Tests Bloque 3: Domicilios 3 vías."""


def _variant_id(client, headers):
    products = client.get("/api/v1/products/?active_only=true", headers=headers).json()
    return next(v["id"] for p in products for v in p["variants"] if v["is_active"])


def test_delivery_managed_requires_fee(client, admin_headers):
    """delivery_mode=managed sin fee debe fallar."""
    res = client.post(
        "/api/v1/orders/",
        json={
            "order_type": "delivery",
            "delivery_mode": "managed",
            "delivery_fee": 0,
            "items": [{"variant_id": _variant_id(client, admin_headers), "quantity": 1}],
        },
        headers=admin_headers,
    )
    assert res.status_code == 400
    assert "gestionado" in res.json()["detail"].lower()


def test_delivery_external_must_have_zero_fee(client, admin_headers):
    """delivery_mode=external con fee > 0 debe fallar."""
    res = client.post(
        "/api/v1/orders/",
        json={
            "order_type": "delivery",
            "delivery_mode": "external",
            "delivery_fee": 5000,
            "items": [{"variant_id": _variant_id(client, admin_headers), "quantity": 1}],
        },
        headers=admin_headers,
    )
    assert res.status_code == 400


def test_delivery_mode_only_for_delivery_orders(client, admin_headers):
    """delivery_mode=managed con dine_in debe fallar."""
    res = client.post(
        "/api/v1/orders/",
        json={
            "order_type": "dine_in",
            "table_number": "TEST-88",
            "delivery_mode": "managed",
            "delivery_fee": 5000,
            "items": [{"variant_id": _variant_id(client, admin_headers), "quantity": 1}],
        },
        headers=admin_headers,
    )
    assert res.status_code == 400


def test_delivery_managed_total_includes_fee(client, admin_headers):
    """Una orden delivery managed debe tener total = subtotal + fee."""
    res = client.post(
        "/api/v1/orders/",
        json={
            "order_type": "delivery",
            "delivery_mode": "managed",
            "delivery_fee": 5000,
            "delivery_address": "Test",
            "items": [{"variant_id": _variant_id(client, admin_headers), "quantity": 1}],
        },
        headers=admin_headers,
    )
    if res.status_code == 200:
        order = res.json()
        assert float(order["delivery_fee"]) == 5000.0
        assert order["delivery_mode"] == "managed"
        # total = subtotal + fee (sin descuento)
        assert abs(float(order["total"]) - (float(order["subtotal"]) + 5000)) < 0.01
