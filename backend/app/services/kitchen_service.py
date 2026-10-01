"""
Lógica de cocina del Rancho La Kamelia.

Funciones principales:
  - route_order_to_stations(order): al crear pedido, asigna cada item a su(s) estación(es)
    y crea los registros en `dispatch_queues`.
  - station_totals(station_key): totales agregados por producto/término para pantallas.
  - neveras_queue(): pedidos por alistar.
  - mark_item_ready(item_station_id): un item terminó en su estación.
  - dispatch_assign_next(queue_type, user_id): asigna próximo pedido al despachador.
  - dispatch_send(queue_id, user_id): marca enviado y descuenta totales (broadcast).
"""
from __future__ import annotations
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional, List
import asyncio
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_

from app.models.order import Order, OrderItem, OrderStatus
from app.models.product import Product, ProductVariant
from app.models.kitchen import (
    KitchenStation, OrderItemStation, DispatchQueue, DispatcherShift,
    StationKey, StationItemStatus, DispatchStatus, DispatchQueueType,
)


# Captura del event loop principal (se setea desde main.py al startup)
MAIN_LOOP = None


def _broadcast(manager, channel: str, event_type: str, payload: dict = None):
    """Helper sync → async broadcast usando el loop principal."""
    try:
        if MAIN_LOOP and MAIN_LOOP.is_running():
            asyncio.run_coroutine_threadsafe(
                manager.broadcast(channel, event_type, payload or {}),
                MAIN_LOOP,
            )
    except Exception as e:
        print(f"[kitchen broadcast] {channel}/{event_type}: {e}")


# ────────────────────────────────────────────────────────────────────────
def _station(db: Session, key: StationKey) -> KitchenStation:
    s = db.query(KitchenStation).filter(KitchenStation.key == key).first()
    if not s:
        # Auto-crear si no existe (defensa)
        s = KitchenStation(key=key, display_name=key.value.title(), color="#888888")
        db.add(s)
        db.flush()
    return s


def _section_to_key(section: str) -> StationKey:
    """Mapea string del producto a enum."""
    try:
        return StationKey(section)
    except Exception:
        return StationKey.entradas


def _queue_type_for_section(section: str) -> DispatchQueueType:
    """A qué cola de despacho va una estación."""
    s = section.lower()
    if s in ("parrilla", "sudados", "fritos", "emplatamiento"):
        return DispatchQueueType.principal
    if s == "entradas":
        return DispatchQueueType.entradas
    if s == "sopas":
        return DispatchQueueType.sopas
    if s == "barra":
        return DispatchQueueType.bebidas
    return DispatchQueueType.principal


# ────────────────────────────────────────────────────────────────────────
def route_order_to_stations(db: Session, order: Order) -> None:
    """
    Al crear un pedido, distribuir cada item a su estación.
    - Si requires_neveras: secuencia neveras → cocción
    - Si no: directo a su estación (entradas, sopas, barra)
    Crea 4 entradas en dispatch_queues como máximo (una por queue_type que tenga items).
    """
    needed_queues: set[DispatchQueueType] = set()

    for item in order.items:
        variant: ProductVariant = item.variant
        if not variant:
            continue
        product: Product = variant.product
        if not product:
            continue

        section_key = _section_to_key(product.kitchen_section or "entradas")
        # Forzar emplatamiento → distribuir a su sub-estación
        # (en seed ya guardamos parrilla/sudados/fritos directo)
        if product.requires_neveras:
            # paso 0: neveras
            db.add(OrderItemStation(
                order_item_id=item.id,
                station_id=_station(db, StationKey.neveras).id,
                sequence=0,
                status=StationItemStatus.queued,
            ))
            # paso 1: cocción (la sección real del producto)
            db.add(OrderItemStation(
                order_item_id=item.id,
                station_id=_station(db, section_key).id,
                sequence=1,
                status=StationItemStatus.queued,
            ))
            # paso 2: emplatamiento (consolidación)
            db.add(OrderItemStation(
                order_item_id=item.id,
                station_id=_station(db, StationKey.emplatamiento).id,
                sequence=2,
                status=StationItemStatus.queued,
            ))
            needed_queues.add(DispatchQueueType.principal)
        else:
            db.add(OrderItemStation(
                order_item_id=item.id,
                station_id=_station(db, section_key).id,
                sequence=0,
                status=StationItemStatus.queued,
            ))
            needed_queues.add(_queue_type_for_section(section_key.value))

    # Crear entradas en cola de despacho
    for qt in needed_queues:
        db.add(DispatchQueue(
            order_id=order.id,
            queue_type=qt,
            status=DispatchStatus.queued,
        ))

    db.flush()

    # Notificar a estaciones relevantes
    from app.websocket.stations import station_manager, dispatch_manager
    # broadcast a cada estación que recibió items
    notified_stations: set[str] = set()
    for item in order.items:
        product = item.variant.product if item.variant else None
        if not product:
            continue
        section = product.kitchen_section or "entradas"
        if product.requires_neveras:
            notified_stations.add("neveras")
            notified_stations.add(section)
        else:
            notified_stations.add(section)
    for s in notified_stations:
        _broadcast(station_manager, s, "order_routed", {"order_id": order.id, "order_number": order.order_number})
    for qt in needed_queues:
        _broadcast(dispatch_manager, qt.value, "queue_updated", {"order_id": order.id, "order_number": order.order_number})


# ────────────────────────────────────────────────────────────────────────
def neveras_queue(db: Session) -> List[dict]:
    """Pedidos pendientes/en proceso en neveras, en orden de llegada."""
    nev = _station(db, StationKey.neveras)
    rows = (
        db.query(OrderItemStation, OrderItem, Order, ProductVariant, Product)
        .join(OrderItem, OrderItemStation.order_item_id == OrderItem.id)
        .join(Order, OrderItem.order_id == Order.id)
        .join(ProductVariant, OrderItem.variant_id == ProductVariant.id)
        .join(Product, ProductVariant.product_id == Product.id)
        .filter(
            OrderItemStation.station_id == nev.id,
            OrderItemStation.status.in_([StationItemStatus.queued, StationItemStatus.in_prep]),
        )
        .order_by(Order.created_at.asc(), OrderItem.id.asc())
        .all()
    )

    by_order: dict[int, dict] = {}
    now = datetime.utcnow()
    for ois, item, order, variant, product in rows:
        if order.id not in by_order:
            by_order[order.id] = {
                "order_id": order.id,
                "order_number": order.order_number,
                "table_number": order.table_number,
                "created_at": order.created_at,
                "waiting_seconds": int((now - (order.created_at.replace(tzinfo=None) if order.created_at else now)).total_seconds()),
                "items": [],
                "status": "queued",
            }
        if ois.status == StationItemStatus.in_prep:
            by_order[order.id]["status"] = "in_prep"
        by_order[order.id]["items"].append({
            "order_item_id": item.id,
            "variant_id": variant.id,
            "product_name": product.name,
            "variant_name": variant.name,
            "quantity": item.quantity,
            "cooking_point": item.cooking_point or "none",
            "target_station": product.kitchen_section or "emplatamiento",
            "notes": item.notes,
        })

    return list(by_order.values())


def neveras_complete_order(db: Session, order_id: int, user_id: Optional[int]) -> None:
    """
    Neveras terminó de alistar el pedido. Marca todos sus items de neveras
    como dispatched (salieron de neveras) y los siguientes pasos quedan
    queued listos para que las estaciones de cocción los tomen.
    """
    nev = _station(db, StationKey.neveras)
    rows = (
        db.query(OrderItemStation)
        .join(OrderItem, OrderItemStation.order_item_id == OrderItem.id)
        .filter(
            OrderItem.order_id == order_id,
            OrderItemStation.station_id == nev.id,
        )
        .all()
    )
    now = datetime.utcnow()
    for ois in rows:
        ois.status = StationItemStatus.dispatched
        ois.dispatched_at = now
        ois.operator_id = user_id

    # Pasar el pedido a in_preparation si estaba pending
    order = db.query(Order).filter(Order.id == order_id).first()
    if order and order.status == OrderStatus.pending:
        order.status = OrderStatus.in_preparation
        order.preparation_started_at = now

    db.commit()

    from app.websocket.stations import station_manager
    for s in ("neveras", "parrilla", "sudados", "fritos", "emplatamiento"):
        _broadcast(station_manager, s, "neveras_completed", {"order_id": order_id})


# ────────────────────────────────────────────────────────────────────────
def station_totals(db: Session, station_key: str) -> dict:
    """
    Totales agregados para la pantalla de una estación.
    Agrupa por producto + variante + punto de cocción.
    """
    try:
        sk = StationKey(station_key)
    except Exception:
        sk = StationKey.entradas
    st = _station(db, sk)

    rows = (
        db.query(OrderItemStation, OrderItem, ProductVariant, Product, Order)
        .join(OrderItem, OrderItemStation.order_item_id == OrderItem.id)
        .join(ProductVariant, OrderItem.variant_id == ProductVariant.id)
        .join(Product, ProductVariant.product_id == Product.id)
        .join(Order, OrderItem.order_id == Order.id)
        .filter(
            OrderItemStation.station_id == st.id,
            OrderItemStation.status.in_([StationItemStatus.queued, StationItemStatus.in_prep]),
        )
        .order_by(OrderItemStation.enqueued_at.asc())
        .all()
    )

    grouped: dict[tuple, dict] = {}
    now = datetime.utcnow()
    seen_orders: set[int] = set()
    in_prep_orders: set[int] = set()

    for ois, item, variant, product, order in rows:
        seen_orders.add(order.id)
        if ois.status == StationItemStatus.in_prep:
            in_prep_orders.add(order.id)
        cp = item.cooking_point or "none"
        key = (product.name, variant.name, cp)
        if key not in grouped:
            grouped[key] = {
                "product_name": product.name,
                "variant_name": variant.name,
                "cooking_point": cp,
                "pending_qty": 0,
                "in_prep_qty": 0,
                "total_qty": 0,
                "earliest_due_at": None,
                "longest_wait_seconds": 0,
            }
        g = grouped[key]
        qty = item.quantity or 1
        if ois.status == StationItemStatus.queued:
            g["pending_qty"] += qty
        else:
            g["in_prep_qty"] += qty
        g["total_qty"] += qty

        # Tiempo de espera
        enq = ois.enqueued_at.replace(tzinfo=None) if ois.enqueued_at else now
        waited = int((now - enq).total_seconds())
        if waited > g["longest_wait_seconds"]:
            g["longest_wait_seconds"] = waited

        # Hora estimada de salida = max(due_de_cada_item)
        due = enq + timedelta(minutes=product.preparation_time_min or 15)
        if g["earliest_due_at"] is None or due > g["earliest_due_at"]:
            g["earliest_due_at"] = due

    return {
        "station_key": sk.value,
        "station_name": st.display_name,
        "color": st.color,
        "rows": list(grouped.values()),
        "orders_in_queue": len(seen_orders - in_prep_orders),
        "orders_in_prep": len(in_prep_orders),
        "generated_at": now,
    }


def emplatamiento_totals(db: Session) -> dict:
    """
    Totales consolidados de PARRILLA + SUDADOS + FRITOS.
    Esta es la pantalla "emplatamiento" donde se ve todo lo que se está
    cocinando antes de mandar a despacho principal.
    """
    base = {}
    combined_rows = []
    for skv in ("parrilla", "sudados", "fritos"):
        t = station_totals(db, skv)
        for r in t["rows"]:
            r["source_station"] = skv
            combined_rows.append(r)
    emp = _station(db, StationKey.emplatamiento)
    return {
        "station_key": "emplatamiento",
        "station_name": emp.display_name,
        "color": emp.color,
        "rows": combined_rows,
        "orders_in_queue": 0,
        "orders_in_prep": 0,
        "generated_at": datetime.utcnow(),
    }


# ────────────────────────────────────────────────────────────────────────
def list_station_items(db: Session, station_key: str, limit: int = 100) -> list[dict]:
    """Para pantallas simples (entradas/sopas/barra): items uno por uno."""
    try:
        sk = StationKey(station_key)
    except Exception:
        sk = StationKey.entradas
    st = _station(db, sk)

    rows = (
        db.query(OrderItemStation, OrderItem, ProductVariant, Product, Order)
        .join(OrderItem, OrderItemStation.order_item_id == OrderItem.id)
        .join(ProductVariant, OrderItem.variant_id == ProductVariant.id)
        .join(Product, ProductVariant.product_id == Product.id)
        .join(Order, OrderItem.order_id == Order.id)
        .filter(
            OrderItemStation.station_id == st.id,
            OrderItemStation.status.in_([StationItemStatus.queued, StationItemStatus.in_prep]),
        )
        .order_by(OrderItemStation.enqueued_at.asc())
        .limit(limit)
        .all()
    )

    now = datetime.utcnow()
    out = []
    for ois, item, variant, product, order in rows:
        enq = ois.enqueued_at.replace(tzinfo=None) if ois.enqueued_at else now
        out.append({
            "item_station_id": ois.id,
            "order_id": order.id,
            "order_number": order.order_number,
            "table_number": order.table_number,
            "product_name": product.name,
            "variant_name": variant.name,
            "quantity": item.quantity,
            "cooking_point": item.cooking_point or "none",
            "notes": item.notes,
            "status": ois.status.value if hasattr(ois.status, "value") else str(ois.status),
            "enqueued_at": enq,
            "waiting_seconds": int((now - enq).total_seconds()),
            "estimated_minutes": product.preparation_time_min or 15,
        })
    return out


def mark_item_ready(db: Session, item_station_id: int, user_id: Optional[int]) -> dict:
    """Operario marca item listo. Si era el último de su pedido en la estación,
    notifica a la siguiente."""
    ois = db.query(OrderItemStation).filter(OrderItemStation.id == item_station_id).first()
    if not ois:
        raise ValueError("Item de estación no encontrado")
    ois.status = StationItemStatus.ready
    ois.ready_at = datetime.utcnow()
    ois.operator_id = user_id
    db.commit()

    from app.websocket.stations import station_manager
    station = db.query(KitchenStation).filter(KitchenStation.id == ois.station_id).first()
    if station:
        _broadcast(station_manager, station.key.value if hasattr(station.key, "value") else str(station.key),
                   "item_ready", {"item_station_id": item_station_id})
        # También notificar a emplatamiento si vienen de parrilla/sudados/fritos
        if station.key in (StationKey.parrilla, StationKey.sudados, StationKey.fritos):
            _broadcast(station_manager, "emplatamiento", "item_ready",
                       {"item_station_id": item_station_id, "source": station.key.value if hasattr(station.key, "value") else str(station.key)})

    return {"item_station_id": item_station_id, "status": "ready"}


def mark_item_in_prep(db: Session, item_station_id: int, user_id: Optional[int]) -> dict:
    ois = db.query(OrderItemStation).filter(OrderItemStation.id == item_station_id).first()
    if not ois:
        raise ValueError("Item no encontrado")
    ois.status = StationItemStatus.in_prep
    ois.in_prep_at = datetime.utcnow()
    ois.operator_id = user_id
    db.commit()

    from app.websocket.stations import station_manager
    station = db.query(KitchenStation).filter(KitchenStation.id == ois.station_id).first()
    if station:
        _broadcast(station_manager, station.key.value if hasattr(station.key, "value") else str(station.key),
                   "item_in_prep", {"item_station_id": item_station_id})
    return {"item_station_id": item_station_id, "status": "in_prep"}


# ────────────────────────────────────────────────────────────────────────
def dispatch_list(db: Session, queue_type: str) -> list[dict]:
    """Lista de pedidos en cola para una cola de despacho específica."""
    try:
        qt = DispatchQueueType(queue_type)
    except Exception:
        qt = DispatchQueueType.principal

    rows = (
        db.query(DispatchQueue, Order)
        .join(Order, DispatchQueue.order_id == Order.id)
        .filter(
            DispatchQueue.queue_type == qt,
            DispatchQueue.status.in_([DispatchStatus.queued, DispatchStatus.assigned]),
        )
        .order_by(DispatchQueue.created_at.asc())
        .all()
    )
    now = datetime.utcnow()
    out = []
    for dq, order in rows:
        created = dq.created_at.replace(tzinfo=None) if dq.created_at else now
        out.append({
            "queue_id": dq.id,
            "order_id": order.id,
            "order_number": order.order_number,
            "table_number": order.table_number,
            "status": dq.status.value if hasattr(dq.status, "value") else str(dq.status),
            "assigned_to_id": dq.assigned_to_id,
            "created_at": dq.created_at,
            "waiting_seconds": int((now - created).total_seconds()),
        })
    return out


def dispatch_my_assignment(db: Session, queue_type: str, user_id: int) -> Optional[dict]:
    """
    Devuelve el pedido asignado al despachador actual.
    Si no tiene ninguno, intenta auto-asignar el siguiente de la cola.
    """
    try:
        qt = DispatchQueueType(queue_type)
    except Exception:
        qt = DispatchQueueType.principal

    # 1) ¿Ya tiene uno asignado?
    current = (
        db.query(DispatchQueue)
        .filter(
            DispatchQueue.queue_type == qt,
            DispatchQueue.assigned_to_id == user_id,
            DispatchQueue.status == DispatchStatus.assigned,
        )
        .first()
    )
    if current:
        return _dispatch_payload(db, current)

    # 2) Asignar el siguiente disponible (FIFO)
    nxt = (
        db.query(DispatchQueue)
        .filter(
            DispatchQueue.queue_type == qt,
            DispatchQueue.status == DispatchStatus.queued,
        )
        .order_by(DispatchQueue.created_at.asc())
        .with_for_update(skip_locked=True)
        .first()
    )
    if not nxt:
        return None
    nxt.assigned_to_id = user_id
    nxt.assigned_at = datetime.utcnow()
    nxt.status = DispatchStatus.assigned
    db.commit()

    from app.websocket.stations import dispatch_manager
    _broadcast(dispatch_manager, qt.value, "assigned",
               {"queue_id": nxt.id, "order_id": nxt.order_id, "user_id": user_id})

    return _dispatch_payload(db, nxt)


def _dispatch_payload(db: Session, dq: DispatchQueue) -> dict:
    order = db.query(Order).filter(Order.id == dq.order_id).first()
    items = []
    if order:
        for it in order.items:
            v = it.variant
            p = v.product if v else None
            items.append({
                "order_item_id": it.id,
                "product_name": p.name if p else "?",
                "variant_name": v.name if v else "?",
                "quantity": it.quantity,
                "cooking_point": it.cooking_point or "none",
                "notes": it.notes,
                "kitchen_section": (p.kitchen_section if p else "?"),
            })
    now = datetime.utcnow()
    created = dq.created_at.replace(tzinfo=None) if dq.created_at else now
    return {
        "queue_id": dq.id,
        "order_id": dq.order_id,
        "order_number": order.order_number if order else "?",
        "table_number": order.table_number if order else None,
        "queue_type": dq.queue_type.value if hasattr(dq.queue_type, "value") else str(dq.queue_type),
        "items": items,
        "assigned_at": dq.assigned_at,
        "waiting_seconds": int((now - created).total_seconds()),
    }


def dispatch_send(db: Session, queue_id: int, user_id: int, notes: Optional[str] = None) -> dict:
    """Despachador marca enviado. Libera el slot y notifica para que se le asigne otro."""
    dq = db.query(DispatchQueue).filter(DispatchQueue.id == queue_id).first()
    if not dq:
        raise ValueError("Cola no encontrada")
    if dq.assigned_to_id != user_id:
        raise ValueError("Este pedido no está asignado a ti")

    dq.status = DispatchStatus.dispatched
    dq.dispatched_at = datetime.utcnow()
    dq.dispatched_by_id = user_id
    if notes:
        dq.notes = (dq.notes or "") + f"\n[{datetime.utcnow().isoformat()}] {notes}"

    # Si TODAS las colas del pedido están dispatched → marcar order delivered
    remaining = db.query(DispatchQueue).filter(
        DispatchQueue.order_id == dq.order_id,
        DispatchQueue.status.in_([DispatchStatus.queued, DispatchStatus.assigned]),
    ).count()
    if remaining == 0:
        order = db.query(Order).filter(Order.id == dq.order_id).first()
        if order and order.status != OrderStatus.delivered:
            order.status = OrderStatus.ready  # listo, falta cobrar
    db.commit()

    # Broadcast a TODAS las pantallas para descontar totales
    from app.websocket.stations import station_manager, dispatch_manager
    qt = dq.queue_type.value if hasattr(dq.queue_type, "value") else str(dq.queue_type)
    for s in ("neveras", "parrilla", "sudados", "fritos", "emplatamiento", "entradas", "sopas", "barra"):
        _broadcast(station_manager, s, "totals_changed", {"reason": "dispatched", "order_id": dq.order_id})
    _broadcast(dispatch_manager, qt, "dispatched", {"queue_id": queue_id, "order_id": dq.order_id})

    return {"queue_id": queue_id, "status": "dispatched"}


# ────────────────────────────────────────────────────────────────────────
def dispatcher_shift_set(db: Session, user_id: int, queue_type: str, is_active: bool) -> dict:
    try:
        qt = DispatchQueueType(queue_type)
    except Exception:
        raise ValueError(f"queue_type inválido: {queue_type}")

    shift = (
        db.query(DispatcherShift)
        .filter(
            DispatcherShift.user_id == user_id,
            DispatcherShift.queue_type == qt,
            DispatcherShift.is_active == True,
        )
        .first()
    )
    if is_active:
        if not shift:
            shift = DispatcherShift(user_id=user_id, queue_type=qt, is_active=True)
            db.add(shift)
            db.flush()
    else:
        if shift:
            shift.is_active = False
            shift.ended_at = datetime.utcnow()
    db.commit()
    return {"user_id": user_id, "queue_type": qt.value, "is_active": is_active}


def active_dispatchers(db: Session, queue_type: Optional[str] = None) -> list[dict]:
    from app.models.user import User
    q = (
        db.query(DispatcherShift, User)
        .join(User, DispatcherShift.user_id == User.id)
        .filter(DispatcherShift.is_active == True)
    )
    if queue_type:
        try:
            qt = DispatchQueueType(queue_type)
            q = q.filter(DispatcherShift.queue_type == qt)
        except Exception:
            pass
    return [
        {
            "id": s.id,
            "user_id": u.id,
            "user_name": u.name,
            "queue_type": s.queue_type.value if hasattr(s.queue_type, "value") else str(s.queue_type),
            "is_active": s.is_active,
            "started_at": s.started_at,
            "ended_at": s.ended_at,
        }
        for s, u in q.all()
    ]
