from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime, timezone, timedelta, date
from app.db.session import get_db
from app.api.deps import get_current_user
from app.models.inventory import InventoryItem
from app.models.order import Order, OrderStatus, Payment
from app.models.financial import DailySummary

router = APIRouter()

COLOMBIA_TZ = timezone(timedelta(hours=-5))


def _now_colombia():
    return datetime.now(COLOMBIA_TZ)


@router.get("/")
def get_notifications(db: Session = Depends(get_db), _=Depends(get_current_user)):
    alerts = []
    now = _now_colombia()
    today = now.date()

    # ── Stock crítico (stock = 0)
    critical = db.query(InventoryItem).filter(
        InventoryItem.is_active == True,
        InventoryItem.current_stock <= 0,
    ).all()
    for item in critical:
        alerts.append({
            "id": f"stock-critical-{item.id}",
            "type": "critical",
            "title": f"SIN STOCK: {item.name}",
            "message": f"{item.name} está completamente agotado. Realiza una compra urgente.",
            "category": "inventory",
        })

    # ── Stock bajo (stock <= mínimo pero > 0)
    low = db.query(InventoryItem).filter(
        InventoryItem.is_active == True,
        InventoryItem.current_stock > 0,
        InventoryItem.current_stock <= InventoryItem.minimum_stock,
    ).all()
    for item in low:
        alerts.append({
            "id": f"stock-low-{item.id}",
            "type": "warning",
            "title": f"Stock bajo: {item.name}",
            "message": f"{item.name} tiene {item.current_stock} {item.unit.abbreviation if item.unit else ''} (mínimo: {item.minimum_stock}). Realiza una compra pronto.",
            "category": "inventory",
        })

    # ── Alerta temprana (stock <= 2x mínimo, pero > mínimo)
    early_warning = db.query(InventoryItem).filter(
        InventoryItem.is_active == True,
        InventoryItem.current_stock > InventoryItem.minimum_stock,
        InventoryItem.current_stock <= InventoryItem.minimum_stock * 2,
    ).all()
    for item in early_warning:
        alerts.append({
            "id": f"stock-early-{item.id}",
            "type": "info",
            "title": f"⚠ Alerta temprana: {item.name}",
            "message": f"{item.name} va a la mitad ({item.current_stock} {item.unit.abbreviation if item.unit else ''}). Considera comprarlo antes de que se agote.",
            "category": "inventory",
        })

    # ── Pedidos pendientes en cocina (> 15 min sin iniciar)
    cutoff = datetime.utcnow() - timedelta(minutes=15)
    stale_orders = db.query(Order).filter(
        Order.status == OrderStatus.pending,
        Order.created_at <= cutoff,
    ).all()
    if stale_orders:
        alerts.append({
            "id": "kitchen-stale",
            "type": "warning",
            "title": f"{len(stale_orders)} pedido(s) sin atender en cocina",
            "message": f"Hay {len(stale_orders)} pedido(s) pendiente(s) hace más de 15 minutos.",
            "category": "kitchen",
        })

    # ── Pedidos listos sin entregar (> 10 min en estado 'ready')
    ready_cutoff = datetime.utcnow() - timedelta(minutes=10)
    ready_orders = db.query(Order).filter(
        Order.status == OrderStatus.ready,
        Order.updated_at <= ready_cutoff,
    ).all()
    if ready_orders:
        alerts.append({
            "id": "kitchen-ready",
            "type": "info",
            "title": f"{len(ready_orders)} pedido(s) listos sin entregar",
            "message": f"{len(ready_orders)} pedido(s) marcados como listos esperan entrega.",
            "category": "kitchen",
        })

    # ── Cierre diario no realizado (después de las 10PM)
    if now.hour >= 22:
        already_closed = db.query(DailySummary).filter(
            DailySummary.summary_date == str(today)
        ).first()
        if not already_closed:
            alerts.append({
                "id": "daily-close-pending",
                "type": "warning",
                "title": "Cierre diario pendiente",
                "message": "Son más de las 10:00 PM y aún no se ha realizado el cierre del día.",
                "category": "finance",
            })

    # ── Pedidos sin pago (cobrar)
    unpaid = db.query(Order).filter(
        Order.status.in_([OrderStatus.pending, OrderStatus.in_preparation, OrderStatus.ready]),
    ).outerjoin(Payment, Payment.order_id == Order.id).filter(Payment.id == None).count()
    if unpaid > 0:
        alerts.append({
            "id": "unpaid-orders",
            "type": "info",
            "title": f"{unpaid} pedido(s) sin cobrar",
            "message": f"Hay {unpaid} pedido(s) listos o en preparación que aún no tienen pago registrado.",
            "category": "finance",
        })

    return {
        "total": len(alerts),
        "critical_count": sum(1 for a in alerts if a["type"] == "critical"),
        "warning_count": sum(1 for a in alerts if a["type"] == "warning"),
        "alerts": alerts,
    }
