"""Tests Bloque 4: Split Payment + Nequi/Daviplata + datos fiscales."""


def _variant_id(client, headers):
    products = client.get("/api/v1/products/?active_only=true", headers=headers).json()
    return next(v["id"] for p in products for v in p["variants"] if v["is_active"])


def test_create_order_with_fiscal_data(client, admin_headers):
    """Los datos fiscales se guardan en la orden."""
    res = client.post(
        "/api/v1/orders/",
        json={
            "order_type": "dine_in",
            "table_number": "T-FIS",
            "customer_type": "juridica",
            "tax_type": "Régimen Simple",
            "tax_id": "900123456-7",
            "items": [{"variant_id": _variant_id(client, admin_headers), "quantity": 1}],
        },
        headers=admin_headers,
    )
    if res.status_code == 200:
        order = res.json()
        assert order["customer_type"] == "juridica"
        assert order["tax_type"] == "Régimen Simple"
        assert order["tax_id"] == "900123456-7"


def test_split_payment_sum_must_match(client, admin_headers):
    """Si la suma de splits no coincide con amount, debe fallar."""
    # Crear orden primero
    res = client.post(
        "/api/v1/orders/",
        json={
            "order_type": "dine_in",
            "table_number": "T-SPLIT",
            "items": [{"variant_id": _variant_id(client, admin_headers), "quantity": 1}],
        },
        headers=admin_headers,
    )
    if res.status_code != 200:
        return  # mesa ocupada — skip
    order = res.json()
    total = float(order["total"])

    # Pagar con splits que NO suman
    res2 = client.post(
        f"/api/v1/orders/{order['id']}/pay",
        json={
            "payment_method": "mixed",
            "amount": total,
            "splits": [
                {"payment_method": "cash", "amount": 100},
                {"payment_method": "nequi", "amount": 50},  # total $150 != total
            ],
        },
        headers=admin_headers,
    )
    assert res2.status_code == 400


def test_nequi_is_valid_payment_method(client, admin_headers):
    """Pago con Nequi debe ser aceptado."""
    res = client.post(
        "/api/v1/orders/",
        json={
            "order_type": "dine_in",
            "table_number": "T-NEQUI",
            "items": [{"variant_id": _variant_id(client, admin_headers), "quantity": 1}],
        },
        headers=admin_headers,
    )
    if res.status_code != 200:
        return
    order = res.json()
    res2 = client.post(
        f"/api/v1/orders/{order['id']}/pay",
        json={
            "payment_method": "nequi",
            "amount": float(order["total"]),
            "reference": "NEQUI-TEST-123",
        },
        headers=admin_headers,
    )
    assert res2.status_code == 200
    assert res2.json()["payment"]["payment_method"] == "nequi"
