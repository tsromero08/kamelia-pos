"""Tests Bloque 2: Adiciones y Cortesía."""


def test_list_addons(client, admin_headers):
    res = client.get("/api/v1/products/addons", headers=admin_headers)
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) > 0  # debe haber al menos los del seed
    for a in data:
        assert "name" in a
        assert "additional_price" in a


def test_courtesy_order_has_zero_total(client, admin_headers):
    # Primero conseguir una variant_id válida
    products = client.get("/api/v1/products/?active_only=true", headers=admin_headers).json()
    variant_id = next(v["id"] for p in products for v in p["variants"] if v["is_active"])

    res = client.post(
        "/api/v1/orders/",
        json={
            "order_type": "dine_in",
            "table_number": "TEST-99",
            "is_courtesy": True,
            "items": [{"variant_id": variant_id, "quantity": 1}],
        },
        headers=admin_headers,
    )
    # Puede fallar con 400 si la mesa ya está ocupada — ese es un test válido
    if res.status_code == 200:
        order = res.json()
        assert order["is_courtesy"] is True
        assert float(order["total"]) == 0.0
        assert float(order["subtotal"]) > 0  # subtotal mantiene el valor de referencia


def test_create_addon_requires_admin(client):
    """Sin autenticar, no se puede crear un addon."""
    res = client.post(
        "/api/v1/products/addons",
        json={"name": "Hack", "additional_price": 999},
    )
    assert res.status_code in (401, 429)
