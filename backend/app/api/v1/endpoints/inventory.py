from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.db.session import get_db
from app.schemas.inventory import (
    UnitOfMeasureCreate, UnitOfMeasureOut,
    SupplierCreate, SupplierUpdate, SupplierOut,
    InventoryItemCreate, InventoryItemUpdate, InventoryItemOut,
    InventoryMovementOut, StockAdjustmentCreate,
)
from app.models.inventory import UnitOfMeasure, Supplier, InventoryItem, InventoryMovement, MovementType
from app.services.inventory_service import apply_stock_adjustment
from app.api.deps import get_current_user, get_admin

router = APIRouter()


@router.get("/units", response_model=List[UnitOfMeasureOut])
def list_units(db: Session = Depends(get_db)):
    return db.query(UnitOfMeasure).all()


@router.post("/units", response_model=UnitOfMeasureOut)
def create_unit(data: UnitOfMeasureCreate, db: Session = Depends(get_db), _=Depends(get_admin)):
    u = UnitOfMeasure(**data.model_dump())
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@router.get("/suppliers", response_model=List[SupplierOut])
def list_suppliers(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(Supplier).filter(Supplier.is_active == True).all()


@router.post("/suppliers", response_model=SupplierOut)
def create_supplier(data: SupplierCreate, db: Session = Depends(get_db), _=Depends(get_admin)):
    s = Supplier(**data.model_dump())
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@router.put("/suppliers/{supplier_id}", response_model=SupplierOut)
def update_supplier(supplier_id: int, data: SupplierUpdate, db: Session = Depends(get_db), _=Depends(get_admin)):
    s = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not s:
        raise HTTPException(404, "Supplier not found")
    for f, v in data.model_dump(exclude_unset=True).items():
        setattr(s, f, v)
    db.commit()
    db.refresh(s)
    return s


@router.get("/items", response_model=List[InventoryItemOut])
def list_items(active_only: bool = True, db: Session = Depends(get_db), _=Depends(get_current_user)):
    q = db.query(InventoryItem)
    if active_only:
        q = q.filter(InventoryItem.is_active == True)
    items = q.order_by(InventoryItem.name).all()
    # Compute is_low_stock
    for item in items:
        item.is_low_stock = item.current_stock <= item.minimum_stock
    return items


@router.get("/items/low-stock", response_model=List[InventoryItemOut])
def low_stock_items(db: Session = Depends(get_db), _=Depends(get_current_user)):
    items = db.query(InventoryItem).filter(
        InventoryItem.is_active == True,
        InventoryItem.current_stock <= InventoryItem.minimum_stock,
    ).all()
    for item in items:
        item.is_low_stock = True
    return items


@router.get("/items/{item_id}", response_model=InventoryItemOut)
def get_item(item_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(404, "Item not found")
    item.is_low_stock = item.current_stock <= item.minimum_stock
    return item


@router.post("/items", response_model=InventoryItemOut)
def create_item(data: InventoryItemCreate, db: Session = Depends(get_db), _=Depends(get_admin)):
    item = InventoryItem(**data.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/items/{item_id}", response_model=InventoryItemOut)
def update_item(item_id: int, data: InventoryItemUpdate, db: Session = Depends(get_db), _=Depends(get_admin)):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(404, "Item not found")
    for f, v in data.model_dump(exclude_unset=True).items():
        setattr(item, f, v)
    db.commit()
    db.refresh(item)
    return item


@router.get("/items/{item_id}/movements", response_model=List[InventoryMovementOut])
def item_movements(item_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(InventoryMovement).filter(
        InventoryMovement.item_id == item_id
    ).order_by(InventoryMovement.created_at.desc()).limit(200).all()


@router.post("/adjustments")
def create_adjustment(data: StockAdjustmentCreate, db: Session = Depends(get_db), current_user=Depends(get_admin)):
    item = apply_stock_adjustment(
        db, data.item_id, data.quantity,
        MovementType.adjustment_positive if data.quantity > 0 else MovementType.adjustment_negative,
        current_user.id, data.notes
    )
    return {"ok": True, "new_stock": float(item.current_stock)}


# ─── LOTES Y FECHAS DE VENCIMIENTO ─────────────────────────────────────────
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pydantic import BaseModel
from app.models.inventory import InventoryBatch


class InventoryBatchCreate(BaseModel):
    item_id: int
    initial_quantity: Decimal
    unit_cost: Decimal = Decimal("0")
    expiry_date: datetime | None = None
    received_date: datetime | None = None
    batch_code: str | None = None
    supplier_id: int | None = None
    notes: str | None = None


class InventoryBatchOut(BaseModel):
    id: int
    item_id: int
    item_name: str | None = None
    batch_code: str | None = None
    initial_quantity: Decimal
    remaining_quantity: Decimal
    unit_cost: Decimal
    received_date: datetime | None = None
    expiry_date: datetime | None = None
    is_depleted: bool = False
    days_to_expiry: int | None = None
    status: str  # "ok" | "warning" | "critical" | "expired" | "depleted"
    notes: str | None = None

    class Config:
        from_attributes = True


def _status_for(b: InventoryBatch) -> tuple[str, int | None]:
    if b.is_depleted or (b.remaining_quantity or 0) <= 0:
        return "depleted", None
    if not b.expiry_date:
        return "ok", None
    now = datetime.now(timezone.utc)
    exp = b.expiry_date if b.expiry_date.tzinfo else b.expiry_date.replace(tzinfo=timezone.utc)
    diff = (exp - now).days
    if diff < 0:
        return "expired", diff
    if diff <= 2:
        return "critical", diff
    if diff <= 7:
        return "warning", diff
    return "ok", diff


def _serialize_batch(b: InventoryBatch) -> dict:
    status, days = _status_for(b)
    return {
        "id": b.id,
        "item_id": b.item_id,
        "item_name": b.item.name if b.item else None,
        "batch_code": b.batch_code,
        "initial_quantity": b.initial_quantity,
        "remaining_quantity": b.remaining_quantity,
        "unit_cost": b.unit_cost,
        "received_date": b.received_date,
        "expiry_date": b.expiry_date,
        "is_depleted": b.is_depleted,
        "days_to_expiry": days,
        "status": status,
        "notes": b.notes,
    }


@router.get("/batches", response_model=list[InventoryBatchOut])
def list_batches(
    item_id: int | None = None,
    include_depleted: bool = False,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    q = db.query(InventoryBatch)
    if item_id:
        q = q.filter(InventoryBatch.item_id == item_id)
    if not include_depleted:
        q = q.filter(InventoryBatch.is_depleted == False)  # noqa: E712
    # Próximos a vencer primero
    q = q.order_by(
        InventoryBatch.expiry_date.is_(None),
        InventoryBatch.expiry_date.asc(),
        InventoryBatch.received_date.desc(),
    )
    return [_serialize_batch(b) for b in q.all()]


@router.get("/batches/alerts", response_model=list[InventoryBatchOut])
def batches_alerts(
    days: int = 7,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """Lotes próximos a vencer (default: 7 días) o ya vencidos."""
    cutoff = datetime.now(timezone.utc) + timedelta(days=days)
    q = (
        db.query(InventoryBatch)
        .filter(InventoryBatch.is_depleted == False,           # noqa: E712
                InventoryBatch.expiry_date.isnot(None),
                InventoryBatch.expiry_date <= cutoff)
        .order_by(InventoryBatch.expiry_date.asc())
    )
    return [_serialize_batch(b) for b in q.all()]


@router.post("/batches", response_model=InventoryBatchOut)
def create_batch(data: InventoryBatchCreate, db: Session = Depends(get_db), current_user=Depends(get_admin)):
    item = db.query(InventoryItem).filter(InventoryItem.id == data.item_id).first()
    if not item:
        raise HTTPException(404, "Insumo no encontrado")
    if data.initial_quantity <= 0:
        raise HTTPException(400, "La cantidad inicial debe ser mayor a 0")
    b = InventoryBatch(
        item_id=data.item_id,
        batch_code=data.batch_code,
        initial_quantity=data.initial_quantity,
        remaining_quantity=data.initial_quantity,
        unit_cost=data.unit_cost,
        expiry_date=data.expiry_date,
        received_date=data.received_date or datetime.utcnow(),
        supplier_id=data.supplier_id,
        notes=data.notes,
    )
    db.add(b)
    # Aumentar el stock global del item porque es una entrada real
    qty_before = item.current_stock
    item.current_stock = (item.current_stock or Decimal("0")) + data.initial_quantity
    db.add(InventoryMovement(
        item_id=item.id,
        movement_type=MovementType.purchase,
        quantity=data.initial_quantity,
        quantity_before=qty_before,
        quantity_after=item.current_stock,
        unit_cost=data.unit_cost,
        reference_type="batch",
        reference_id=None,
        user_id=current_user.id,
        notes=f"Lote creado ({data.batch_code or 'sin código'})",
    ))
    db.commit()
    db.refresh(b)
    return _serialize_batch(b)


@router.delete("/batches/{batch_id}")
def delete_batch(batch_id: int, db: Session = Depends(get_db), current_user=Depends(get_admin)):
    """Elimina un lote vacío o descarta uno con stock (descuenta del item)."""
    b = db.query(InventoryBatch).filter(InventoryBatch.id == batch_id).first()
    if not b:
        raise HTTPException(404, "Lote no encontrado")
    item = b.item
    if item and (b.remaining_quantity or 0) > 0:
        qty_before = item.current_stock
        item.current_stock = (item.current_stock or Decimal("0")) - (b.remaining_quantity or Decimal("0"))
        db.add(InventoryMovement(
            item_id=item.id,
            movement_type=MovementType.waste,
            quantity=-(b.remaining_quantity or Decimal("0")),
            quantity_before=qty_before,
            quantity_after=item.current_stock,
            unit_cost=b.unit_cost,
            reference_type="batch_discard",
            reference_id=b.id,
            user_id=current_user.id,
            notes=f"Lote descartado/vencido ({b.batch_code or 'sin código'})",
        ))
    db.delete(b)
    db.commit()
    return {"ok": True}
