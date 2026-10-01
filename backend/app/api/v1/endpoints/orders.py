from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from decimal import Decimal
from app.db.session import get_db
from app.schemas.order import OrderCreate, OrderOut, PaymentCreate, OrderStatusUpdate
from app.models.order import Order, OrderStatus
from app.models.audit import AuditLog
from app.models.user import User
from app.services.order_service import create_order, process_payment, update_order_status, add_items_to_order
from app.schemas.order import OrderItemCreate
from app.api.deps import get_current_user, get_admin
from app.core.security import verify_password
from pydantic import BaseModel

router = APIRouter()


class AuthorizedStatusUpdate(BaseModel):
    status: OrderStatus
    notes: Optional[str] = None
    password: Optional[str] = None


@router.get("/", response_model=List[OrderOut])
def list_orders(
    status: Optional[OrderStatus] = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    q = db.query(Order)
    if status:
        q = q.filter(Order.status == status)
    return q.order_by(Order.created_at.desc()).offset(offset).limit(limit).all()


@router.get("/kitchen", response_model=List[OrderOut])
def kitchen_orders(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(Order).filter(
        Order.status.in_([OrderStatus.pending, OrderStatus.in_preparation, OrderStatus.ready])
    ).order_by(Order.created_at.asc()).all()


@router.get("/tables/status")
def tables_status(db: Session = Depends(get_db), _=Depends(get_current_user)):
    """
    Devuelve solo mesas en uso (no devuelve mesas libres ni mesas pagadas).
    Estados:
    - 'occupied': pedido pendiente o en preparación
    - 'pending_payment': pedido listo (ready), pendiente de cobro
    Las mesas con pedido pagado (delivered) NO aparecen — están libres.
    """
    active = db.query(Order).filter(
        Order.status.in_([OrderStatus.pending, OrderStatus.in_preparation, OrderStatus.ready]),
        Order.table_number.isnot(None),
    ).all()

    out = {}
    for o in active:
        if not o.table_number:
            continue
        key = o.table_number.strip()
        if not key:
            continue
        # Si el pedido ya tiene pago, la mesa está libre — no la reportamos
        if o.payment is not None:
            continue
        state = "pending_payment" if o.status == OrderStatus.ready else "occupied"
        out[key] = {
            "order_id": o.id,
            "order_number": o.order_number,
            "status": o.status.value,
            "table_state": state,
            "total": str(o.total),
        }
    return out


@router.get("/invoices", response_model=List[OrderOut])
def list_invoices(
    limit: int = 200,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    Pedidos pagados con su factura, ordenados por fecha de pago descendente
    (la más reciente primero). El consecutivo de factura es continuo y nunca se
    reinicia (ver _generate_invoice_number en order_service.py).
    """
    from app.models.order import Payment as Pay
    return (
        db.query(Order)
        .join(Pay, Pay.order_id == Order.id)
        .order_by(Pay.created_at.desc(), Pay.invoice_number.desc())
        .limit(limit)
        .all()
    )


@router.get("/{order_id}", response_model=OrderOut)
def get_order(order_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(404, "Pedido no encontrado")
    return order


class AddItemsIn(BaseModel):
    items: List[OrderItemCreate]


@router.post("/{order_id}/items", response_model=OrderOut)
def append_items(
    order_id: int,
    data: AddItemsIn,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Mesa abierta: agregar más items a un pedido no pagado (Rancho La Kamelia)."""
    try:
        return add_items_to_order(db, order_id, data.items, cashier_id=current_user.id)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/", response_model=OrderOut)
def new_order(data: OrderCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    # Permiso 4.1: solo Administrador puede crear pedidos como cortesía
    if getattr(data, "is_courtesy", False):
        role_name = current_user.role.name if current_user.role else ""
        if role_name != "Administrador":
            raise HTTPException(
                403,
                "Solo un Administrador puede registrar un pedido como cortesía."
            )
    try:
        return create_order(db, data, cashier_id=current_user.id)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/{order_id}/pay", response_model=OrderOut)
def pay_order(order_id: int, data: PaymentCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    # Permiso 4.1: cerrar un pago como 'cortesía' es exclusivo de Administrador
    if str(getattr(data, "payment_method", "")).lower() in ("courtesy", "paymentmethod.courtesy"):
        role_name = current_user.role.name if current_user.role else ""
        if role_name != "Administrador":
            raise HTTPException(
                403,
                "Solo un Administrador puede cerrar un pedido como cortesía."
            )
    try:
        return process_payment(db, order_id, data, user_id=current_user.id)
    except ValueError as e:
        raise HTTPException(400, str(e))


class OrderEdit(BaseModel):
    """SOLO ADMIN. Edita campos meta de un pedido sin tocar items ni recetas."""
    table_number: Optional[str] = None
    notes: Optional[str] = None
    discount: Optional[Decimal] = None


@router.patch("/{order_id}", response_model=OrderOut)
def edit_order(
    order_id: int,
    data: OrderEdit,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin),
):
    """SOLO ADMIN. Edita mesa, notas, descuento. Recalcula total."""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(404, "Pedido no encontrado")
    if order.payment:
        raise HTTPException(400, "No se puede editar un pedido ya facturado. Cancele primero.")

    old = {"table_number": order.table_number, "notes": order.notes, "discount": str(order.discount)}

    if data.table_number is not None:
        new_table = data.table_number.strip()
        # Si cambia mesa, validar que la nueva no esté ocupada por otro pedido activo
        if new_table and new_table != (order.table_number or ""):
            conflict = db.query(Order).filter(
                Order.id != order.id,
                Order.table_number == new_table,
                Order.status.in_([OrderStatus.pending, OrderStatus.in_preparation, OrderStatus.ready]),
            ).first()
            if conflict and conflict.payment is None:
                raise HTTPException(400, f"La mesa {new_table} ya tiene pedido activo (#{conflict.order_number})")
        order.table_number = new_table or None

    if data.notes is not None:
        order.notes = data.notes or None

    if data.discount is not None:
        if data.discount < 0:
            raise HTTPException(400, "El descuento no puede ser negativo")
        if data.discount > order.subtotal:
            raise HTTPException(400, f"El descuento ({data.discount}) supera el subtotal ({order.subtotal})")
        order.discount = data.discount
        order.total = order.subtotal - order.discount + (order.tax or Decimal("0"))

    db.add(AuditLog(
        user_id=current_user.id,
        action="edit_order",
        entity_type="order",
        entity_id=order.id,
        old_value=old,
        new_value={"table_number": order.table_number, "notes": order.notes,
                   "discount": str(order.discount), "total": str(order.total)},
    ))
    db.commit()
    db.refresh(order)
    # Sync pedido ↔ caja ↔ cocina: notificar a todos los paneles abiertos.
    from app.services.order_service import _broadcast_system_event, _broadcast_kitchen_event
    payload = {
        "order_id": order.id,
        "order_number": order.order_number,
        "table_number": order.table_number,
        "total": str(order.total),
        "discount": str(order.discount),
        "notes": order.notes,
    }
    _broadcast_system_event("order_updated", payload)
    _broadcast_kitchen_event("order_updated", payload)
    return order


@router.patch("/{order_id}/status", response_model=OrderOut)
def change_status(
    order_id: int,
    data: AuthorizedStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(404, "Pedido no encontrado")

    # Protección post-pago: solo se exige contraseña para CANCELAR un pedido ya pagado.
    # Cambios operativos de cocina (pending→in_preparation→ready→delivered) siempre permitidos.
    PROTECTED_STATUSES = {OrderStatus.cancelled}
    authorized = False
    if order.payment and data.status in PROTECTED_STATUSES:
        if not data.password:
            raise HTTPException(
                403,
                "Cancelar un pedido ya facturado requiere contraseña de autorización."
            )
        if not verify_password(data.password, current_user.hashed_password):
            raise HTTPException(403, "Contraseña incorrecta. Acción no autorizada.")
        authorized = True
    elif order.payment:
        # Cambio operativo en pedido pagado: permitir sin contraseña
        authorized = True

    status_data = OrderStatusUpdate(status=data.status, notes=data.notes)
    try:
        return update_order_status(db, order_id, status_data, user_id=current_user.id, authorized=authorized)
    except ValueError as e:
        raise HTTPException(400, str(e))


# Mejora 4: eliminación explícitamente bloqueada — las ventas son inmutables
@router.delete("/{order_id}")
def delete_order_forbidden(*args, **kwargs):
    raise HTTPException(
        405,
        "Las ventas y facturas no pueden eliminarse. El sistema mantiene trazabilidad completa. "
        "Usa cancelación con autorización si es necesario."
    )
