from sqlalchemy.orm import Session
from decimal import Decimal
from datetime import datetime
from typing import Optional
import asyncio
from app.models.order import (
    Order, OrderItem, OrderItemModifier, OrderItemOption,
    Payment, PaymentSplit, OrderStatus, OrderStatusHistory, OrderType,
    DeliveryMode, PaymentMethod,
)
from app.models.product import ProductVariant, ProductOption
from app.models.audit import AuditLog
from app.schemas.order import OrderCreate, PaymentCreate, OrderStatusUpdate
from app.services.inventory_service import deduct_inventory_for_order, restore_inventory_for_order
from app.core.config import settings


# Event loop principal (capturado en main.py al startup)
MAIN_EVENT_LOOP = None


def _broadcast_system_event(event_type: str, payload: dict = None):
    """
    Broadcast hacia /ws/system. Funciona desde endpoints sync
    usando run_coroutine_threadsafe en el loop principal.
    """
    try:
        from app.websocket.system import system_manager
        if MAIN_EVENT_LOOP and MAIN_EVENT_LOOP.is_running():
            asyncio.run_coroutine_threadsafe(
                system_manager.broadcast(event_type, payload or {}),
                MAIN_EVENT_LOOP,
            )
    except Exception as e:
        print(f"[broadcast system] error: {e}")


def _broadcast_kitchen_event(event_type: str, payload: dict = None):
    """Broadcast hacia /ws/kitchen — mismo mecanismo."""
    try:
        from app.websocket.kitchen import kitchen_manager
        if MAIN_EVENT_LOOP and MAIN_EVENT_LOOP.is_running():
            asyncio.run_coroutine_threadsafe(
                kitchen_manager.broadcast({"type": event_type, "data": payload or {}}),
                MAIN_EVENT_LOOP,
            )
    except Exception as e:
        print(f"[broadcast kitchen] error: {e}")


def _generate_order_number(db: Session) -> str:
    count = db.query(Order).count()
    return f"PB-{datetime.now().strftime('%Y%m%d')}-{str(count + 1).zfill(4)}"


def _generate_invoice_number(db: Session) -> str:
    """Sequential invoice number — continuous, never resets, zero-padded to 6 digits."""
    count = db.query(Payment).count()
    return f"FAC-{str(count + 1).zfill(6)}"


def calculate_item_price(db: Session, item_data) -> Decimal:
    variant = db.query(ProductVariant).filter(ProductVariant.id == item_data.variant_id).first()
    if not variant:
        raise ValueError(f"Variante {item_data.variant_id} no encontrada")

    price = variant.price
    for mod in item_data.modifiers:
        if mod.modifier_type == "extra":
            price += mod.additional_price
    for sel_opt in item_data.selected_options:
        opt = db.query(ProductOption).filter(ProductOption.id == sel_opt.option_id).first()
        if opt:
            price += opt.additional_price

    return price


def create_order(db: Session, order_data: OrderCreate, cashier_id: Optional[int] = None) -> Order:
    # Mejora 3: validación obligatoria de mesa en backend
    requires_table = order_data.order_type not in [OrderType.delivery, OrderType.whatsapp]
    if requires_table and not (order_data.table_number and order_data.table_number.strip()):
        raise ValueError("El número de mesa es obligatorio para pedidos en sitio o para llevar")

    # Bloque 3: validar consistencia delivery_managed
    dmode = getattr(order_data, "delivery_mode", DeliveryMode.none) or DeliveryMode.none
    dfee = Decimal(str(getattr(order_data, "delivery_fee", 0) or 0))
    if dmode == DeliveryMode.managed and dfee <= 0:
        raise ValueError(
            "Modo de domicilio 'gestionado' requiere un valor de envío mayor a $0. "
            "Si no cobras el envío, usa 'external' (repartidor externo) o 'none'."
        )
    if dmode == DeliveryMode.external and dfee > 0:
        # El fee externo no se contabiliza como ingreso → debe ser 0
        raise ValueError(
            "En modo 'external' el cliente paga al repartidor directamente. "
            "El valor de envío debe ser $0."
        )
    if dmode != DeliveryMode.none and order_data.order_type != OrderType.delivery:
        raise ValueError("Modo de domicilio solo aplica a pedidos tipo 'delivery'.")

    # Validación de unicidad de mesa: solo bloquea si hay pedido SIN PAGAR en esa mesa.
    # Pedidos pagados (delivered) liberan la mesa automáticamente.
    if order_data.table_number and order_data.table_number.strip():
        conflicting = db.query(Order).filter(
            Order.table_number == order_data.table_number.strip(),
            Order.status.in_([OrderStatus.pending, OrderStatus.in_preparation, OrderStatus.ready]),
        ).all()
        # Filtrar los que ya tienen pago (mesa libre aunque el estado no se haya actualizado)
        conflicting = [c for c in conflicting if c.payment is None]
        if conflicting:
            c = conflicting[0]
            raise ValueError(
                f"La mesa {order_data.table_number} ya tiene un pedido activo "
                f"(#{c.order_number}). Cierra o cancela ese pedido primero."
            )

    order_number = _generate_order_number(db)

    order = Order(
        order_number=order_number,
        customer_id=order_data.customer_id,
        cashier_id=cashier_id,
        order_type=order_data.order_type,
        table_number=order_data.table_number,
        delivery_address=order_data.delivery_address,
        notes=order_data.notes,
        discount=order_data.discount or Decimal("0"),
        status=OrderStatus.pending,
        # Bloque 2: cortesía
        is_courtesy=bool(getattr(order_data, "is_courtesy", False)),
        # Bloque 3: domicilios
        delivery_mode=getattr(order_data, "delivery_mode", DeliveryMode.none) or DeliveryMode.none,
        delivery_fee=getattr(order_data, "delivery_fee", Decimal("0")) or Decimal("0"),
        # Bloque 4: fiscalidad
        customer_type=getattr(order_data, "customer_type", None) or "natural",
        tax_type=getattr(order_data, "tax_type", None),
        tax_id=getattr(order_data, "tax_id", None),
    )
    db.add(order)
    db.flush()

    subtotal = Decimal("0")
    for item_data in order_data.items:
        unit_price = calculate_item_price(db, item_data)
        item_subtotal = unit_price * item_data.quantity

        order_item = OrderItem(
            order_id=order.id,
            variant_id=item_data.variant_id,
            quantity=item_data.quantity,
            unit_price=unit_price,
            subtotal=item_subtotal,
            notes=item_data.notes,
            cooking_point=getattr(item_data, "cooking_point", None) or "none",
        )
        db.add(order_item)
        db.flush()

        for mod in item_data.modifiers:
            db.add(OrderItemModifier(
                order_item_id=order_item.id,
                inventory_item_id=mod.inventory_item_id,
                modifier_type=mod.modifier_type,
                name=mod.name,
                quantity=mod.quantity,
                additional_price=mod.additional_price,
            ))

        for sel_opt in item_data.selected_options:
            opt = db.query(ProductOption).filter(ProductOption.id == sel_opt.option_id).first()
            db.add(OrderItemOption(
                order_item_id=order_item.id,
                option_id=sel_opt.option_id,
                additional_price=opt.additional_price if opt else Decimal("0"),
            ))

        subtotal += item_subtotal

    order.subtotal = subtotal
    # Total = subtotal − descuento + impuestos + costo de envío (si delivery managed)
    delivery_fee = order.delivery_fee or Decimal("0")
    order.total = subtotal - order.discount + order.tax + delivery_fee

    # Bloque 2: si es cortesía, el cliente paga $0 (subtotal queda como precio de referencia)
    if order.is_courtesy:
        order.total = Decimal("0")
        # Caso de borde: cortesía + delivery_managed → el repartidor SÍ cobra
        # aunque la comida sea regalo. Audit log + flag para reportes.
        if order.delivery_mode == DeliveryMode.managed and delivery_fee > 0:
            db.add(AuditLog(
                user_id=cashier_id,
                action="courtesy_with_managed_delivery",
                entity_type="order",
                entity_id=order.id,
                new_value={
                    "warning": "Cortesía con domicilio gestionado: el local perderá el costo del envío.",
                    "delivery_fee": str(delivery_fee),
                    "order_number": order_number,
                },
            ))

    db.add(OrderStatusHistory(order_id=order.id, status=OrderStatus.pending, changed_by_id=cashier_id))

    # Audit log
    db.add(AuditLog(
        user_id=cashier_id,
        action="create_order",
        entity_type="order",
        entity_id=order.id,
        new_value={"order_number": order_number, "total": str(order.total)},
    ))

    db.commit()
    db.refresh(order)

    # ── Ruteo automático a estaciones de cocina (Rancho La Kamelia) ─────
    try:
        from app.services import kitchen_service
        kitchen_service.route_order_to_stations(db, order)
    except Exception as e:
        print(f"[order_service] no se pudo rutear pedido a estaciones: {e}")

    _broadcast_system_event("order_created", {"order_number": order_number, "total": str(order.total)})
    # Notificar a cocina inmediatamente (sin esperar polling)
    _broadcast_kitchen_event("order_created", {
        "order_id": order.id,
        "order_number": order_number,
        "table_number": order.table_number,
        "total": str(order.total),
    })
    return order


def add_items_to_order(db: Session, order_id: int, new_items: list, cashier_id: Optional[int] = None) -> Order:
    """
    Mesa abierta — agrega items a un pedido existente que NO está pagado.
    Crea OrderItems nuevos, recalcula subtotal/total y rutea los items
    nuevos a las estaciones (neveras/cocción o estación directa).
    """
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise ValueError("Pedido no encontrado")
    if order.payment is not None:
        raise ValueError("Este pedido ya fue facturado, no se pueden agregar items")
    if order.status == OrderStatus.cancelled:
        raise ValueError("Pedido cancelado, no se pueden agregar items")

    added: list[OrderItem] = []
    extra_subtotal = Decimal("0")
    for item_data in new_items:
        unit_price = calculate_item_price(db, item_data)
        item_subtotal = unit_price * item_data.quantity
        order_item = OrderItem(
            order_id=order.id,
            variant_id=item_data.variant_id,
            quantity=item_data.quantity,
            unit_price=unit_price,
            subtotal=item_subtotal,
            notes=item_data.notes,
            cooking_point=getattr(item_data, "cooking_point", None) or "none",
        )
        db.add(order_item)
        db.flush()
        added.append(order_item)

        for mod in item_data.modifiers:
            db.add(OrderItemModifier(
                order_item_id=order_item.id,
                inventory_item_id=mod.inventory_item_id,
                modifier_type=mod.modifier_type,
                name=mod.name,
                quantity=mod.quantity,
                additional_price=mod.additional_price,
            ))
        for sel_opt in item_data.selected_options:
            opt = db.query(ProductOption).filter(ProductOption.id == sel_opt.option_id).first()
            db.add(OrderItemOption(
                order_item_id=order_item.id,
                option_id=sel_opt.option_id,
                additional_price=opt.additional_price if opt else Decimal("0"),
            ))
        extra_subtotal += item_subtotal

    order.subtotal = (order.subtotal or Decimal("0")) + extra_subtotal
    order.total = order.subtotal - (order.discount or Decimal("0")) + (order.tax or Decimal("0")) + (order.delivery_fee or Decimal("0"))
    if order.is_courtesy:
        order.total = Decimal("0")

    db.add(AuditLog(
        user_id=cashier_id,
        action="add_items_to_open_order",
        entity_type="order",
        entity_id=order.id,
        new_value={
            "order_number": order.order_number,
            "items_added": len(added),
            "extra_subtotal": str(extra_subtotal),
            "new_total": str(order.total),
        },
    ))

    db.commit()
    db.refresh(order)

    # Ruteo a estaciones solo de los items recién agregados
    try:
        from app.services import kitchen_service
        # Wrapper: solo los nuevos
        class _FakeOrder:
            def __init__(self, o, items):
                self.id = o.id
                self.order_number = o.order_number
                self.items = items
                self.table_number = o.table_number
        kitchen_service.route_order_to_stations(db, _FakeOrder(order, added))
    except Exception as e:
        print(f"[add_items_to_order] no se pudo rutear nuevos items: {e}")

    _broadcast_system_event("order_updated", {"order_number": order.order_number, "items_added": len(added)})
    _broadcast_kitchen_event("order_updated", {"order_id": order.id, "order_number": order.order_number})
    return order


def process_payment(db: Session, order_id: int, payment_data: PaymentCreate, user_id: Optional[int] = None) -> Order:
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise ValueError("Pedido no encontrado")
    if order.payment:
        raise ValueError("Este pedido ya tiene un pago registrado")

    invoice_number = _generate_invoice_number(db)
    table_freed = order.table_number

    # Bloque 4: si hay splits, validar suma y forzar payment_method='mixed'
    splits_in = getattr(payment_data, "splits", None) or []
    is_split = len(splits_in) > 1
    effective_method = payment_data.payment_method
    if is_split:
        total_splits = sum((Decimal(str(s.amount)) for s in splits_in), Decimal("0"))
        if abs(total_splits - Decimal(str(payment_data.amount))) > Decimal("0.01"):
            raise ValueError(
                f"La suma de los pagos divididos ({total_splits}) no coincide con el monto total ({payment_data.amount})."
            )
        effective_method = PaymentMethod.mixed

    # Atar el pago a la sesión de caja abierta del cajero actual (si existe)
    cash_session_id = None
    if user_id:
        try:
            from app.models.cash_session import CashSession
            sess = (
                db.query(CashSession)
                .filter(CashSession.cashier_id == user_id, CashSession.status == "open")
                .first()
            )
            if sess:
                cash_session_id = sess.id
        except Exception:
            pass

    # Propina (Rancho La Kamelia: 10% sugerido, modificable por cliente)
    tip_amount = Decimal(str(getattr(payment_data, "tip_amount", 0) or 0))
    tip_percent = Decimal(str(getattr(payment_data, "tip_percent", 0) or 0))
    if hasattr(order, "tip_amount"):
        order.tip_amount = tip_amount
        order.tip_percent = tip_percent

    payment = Payment(
        order_id=order.id,
        invoice_number=invoice_number,
        payment_method=effective_method,
        amount=payment_data.amount,
        change_given=payment_data.change_given,
        reference=payment_data.reference,
        notes=payment_data.notes,
        is_split=is_split,
        cash_session_id=cash_session_id,
    )
    db.add(payment)
    db.flush()

    # Bloque 4: registrar los splits si existen
    for s in splits_in:
        db.add(PaymentSplit(
            payment_id=payment.id,
            payment_method=s.payment_method,
            amount=s.amount,
            reference=s.reference,
        ))

    # Bloque 3: si el domicilio es "gestionado" y hay fee, crear gasto automático
    # (pasivo/salida) hacia el repartidor para que la utilidad neta sea real.
    if order.delivery_mode == DeliveryMode.managed and (order.delivery_fee or Decimal("0")) > 0:
        try:
            from app.models.expense import Expense, ExpenseCategory, ExpensePaymentMethod
            cat = db.query(ExpenseCategory).filter(ExpenseCategory.name == "Domicilios").first()
            if not cat:
                cat = ExpenseCategory(name="Domicilios",
                    description="Pagos a repartidores (auto)", is_active=True)
                db.add(cat)
                db.flush()
            db.add(Expense(
                category_id=cat.id,
                created_by_id=user_id,
                description=f"Pago repartidor — Pedido {order.order_number} / Factura {invoice_number}",
                amount=order.delivery_fee,
                payment_method=ExpensePaymentMethod.cash,
                notes=f"Auto-generado al cobrar pedido en modo delivery_managed",
            ))
        except Exception as e:
            print(f"[process_payment] no se pudo crear gasto de domicilio: {e}")

    deduct_inventory_for_order(db, order, user_id)

    # Liberar mesa: marcar pedido como delivered y registrar timestamp
    order.status = OrderStatus.delivered
    if not order.delivered_at:
        order.delivered_at = datetime.utcnow()
    db.add(OrderStatusHistory(
        order_id=order.id,
        status=OrderStatus.delivered,
        changed_by_id=user_id,
        notes=f"Cerrado automáticamente por pago {invoice_number}",
    ))

    # Audit log
    db.add(AuditLog(
        user_id=user_id,
        action="process_payment",
        entity_type="payment",
        entity_id=payment.id,
        new_value={
            "invoice_number": invoice_number,
            "order_id": order_id,
            "amount": str(payment_data.amount),
            "method": payment_data.payment_method,
            "table_freed": table_freed,
        },
    ))

    db.commit()
    db.refresh(order)
    _broadcast_system_event("order_paid", {
        "invoice_number": invoice_number,
        "order_id": order_id,
        "table_freed": table_freed,
    })
    # También notificar a cocina para que actualice el estado del pedido
    _broadcast_kitchen_event("order_paid", {"order_id": order_id, "table_freed": table_freed})
    return order


def update_order_status(
    db: Session,
    order_id: int,
    status_data: OrderStatusUpdate,
    user_id: Optional[int] = None,
    authorized: bool = False,
) -> Order:
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise ValueError("Pedido no encontrado")

    # Mejora 4 + 6: bloquear cambios post-pago sin autorización
    if order.payment and not authorized:
        raise ValueError(
            "Este pedido ya fue facturado. Para modificarlo se requiere autorización de contraseña."
        )

    old_status = order.status
    order.status = status_data.status

    if status_data.status == OrderStatus.in_preparation and not order.preparation_started_at:
        order.preparation_started_at = datetime.utcnow()

    if status_data.status == OrderStatus.delivered:
        order.delivered_at = datetime.utcnow()

    if status_data.status == OrderStatus.cancelled and old_status != OrderStatus.cancelled:
        restore_inventory_for_order(db, order, user_id)

    db.add(OrderStatusHistory(
        order_id=order.id,
        status=status_data.status,
        changed_by_id=user_id,
        notes=status_data.notes,
    ))

    # Audit log para cambios post-facturación
    if order.payment:
        db.add(AuditLog(
            user_id=user_id,
            action="modify_after_payment",
            entity_type="order",
            entity_id=order.id,
            old_value={"status": old_status.value},
            new_value={"status": status_data.status.value, "notes": status_data.notes},
        ))

    db.commit()
    db.refresh(order)
    # Notificar a todas las pantallas de cocina al cambiar estado
    _broadcast_kitchen_event("order_status_changed", {
        "order_id": order.id,
        "order_number": order.order_number,
        "status": status_data.status.value,
        "table_number": order.table_number,
    })
    return order
