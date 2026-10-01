from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel
from app.db.session import get_db
from app.schemas.purchase import PurchaseCreate, PurchaseOut
from app.models.purchase import Purchase, PurchaseItem
from app.models.inventory import InventoryCostHistory, InventoryItem, InventoryMovement, MovementType
from app.models.audit import AuditLog
from app.services.inventory_service import apply_purchase
from app.api.deps import get_current_user, get_admin

router = APIRouter()


def _gen_purchase_number(db: Session) -> str:
    count = db.query(Purchase).count()
    return f"COM-{datetime.now().strftime('%Y%m%d')}-{str(count + 1).zfill(4)}"


@router.get("/", response_model=List[PurchaseOut])
def list_purchases(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(Purchase).order_by(Purchase.purchase_date.desc()).limit(100).all()


@router.get("/{purchase_id}", response_model=PurchaseOut)
def get_purchase(purchase_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    p = db.query(Purchase).filter(Purchase.id == purchase_id).first()
    if not p:
        raise HTTPException(404, "Purchase not found")
    return p


@router.post("/", response_model=PurchaseOut)
def create_purchase(data: PurchaseCreate, db: Session = Depends(get_db), current_user=Depends(get_admin)):
    purchase_number = _gen_purchase_number(db)
    purchase = Purchase(
        purchase_number=purchase_number,
        supplier_id=data.supplier_id,
        created_by_id=current_user.id,
        notes=data.notes,
        purchase_date=data.purchase_date or datetime.utcnow(),
    )
    db.add(purchase)
    db.flush()

    total = 0
    for item_data in data.items:
        total_cost = item_data.quantity * item_data.unit_cost
        pi = PurchaseItem(
            purchase_id=purchase.id,
            inventory_item_id=item_data.inventory_item_id,
            quantity=item_data.quantity,
            unit_cost=item_data.unit_cost,
            total_cost=total_cost,
            notes=item_data.notes,
        )
        db.add(pi)
        db.flush()

        # Update inventory
        apply_purchase(db, pi.id, item_data.inventory_item_id, item_data.quantity,
                       item_data.unit_cost, current_user.id)

        # Record cost history
        db.add(InventoryCostHistory(
            item_id=item_data.inventory_item_id,
            cost=item_data.unit_cost,
            source="purchase",
            notes=f"Compra {purchase_number}",
        ))

        total += float(total_cost)

    purchase.total = total
    db.commit()
    db.refresh(purchase)
    return purchase


class PurchaseUpdate(BaseModel):
    """Solo permite editar metadatos seguros: notas, proveedor, fecha. NO los items.
    Para cambiar items, eliminar y recrear (mantiene integridad de inventario)."""
    supplier_id: Optional[int] = None
    notes: Optional[str] = None
    purchase_date: Optional[datetime] = None


@router.put("/{purchase_id}", response_model=PurchaseOut)
def update_purchase(
    purchase_id: int,
    data: PurchaseUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_admin),
):
    """SOLO ADMIN. Edita metadatos de una compra (no los items, para preservar inventario)."""
    p = db.query(Purchase).filter(Purchase.id == purchase_id).first()
    if not p:
        raise HTTPException(404, "Compra no encontrada")

    old = {
        "supplier_id": p.supplier_id,
        "notes": p.notes,
        "purchase_date": p.purchase_date.isoformat() if p.purchase_date else None,
    }

    if data.supplier_id is not None:
        p.supplier_id = data.supplier_id
    if data.notes is not None:
        p.notes = data.notes
    if data.purchase_date is not None:
        p.purchase_date = data.purchase_date

    db.add(AuditLog(
        user_id=current_user.id,
        action="update_purchase",
        entity_type="purchase",
        entity_id=p.id,
        old_value=old,
        new_value={"supplier_id": p.supplier_id, "notes": p.notes,
                   "purchase_date": p.purchase_date.isoformat() if p.purchase_date else None},
    ))
    db.commit()
    db.refresh(p)
    return p


@router.delete("/{purchase_id}")
def delete_purchase(
    purchase_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_admin),
):
    """
    SOLO ADMIN. Elimina una compra REVIRTIENDO el stock que añadió.
    Si tras revertir, el stock quedaría negativo, rechaza con 400.
    """
    p = db.query(Purchase).filter(Purchase.id == purchase_id).first()
    if not p:
        raise HTTPException(404, "Compra no encontrada")

    # Validar que se puede revertir sin dejar stock negativo
    for item in p.items:
        inv = db.query(InventoryItem).filter(InventoryItem.id == item.inventory_item_id).first()
        if inv and inv.current_stock < item.quantity:
            raise HTTPException(
                400,
                f"No se puede eliminar: el item '{inv.name}' ya consumió parte del stock "
                f"comprado ({inv.current_stock} disponible, {item.quantity} a revertir).",
            )

    # Revertir cada item
    for item in p.items:
        inv = db.query(InventoryItem).filter(InventoryItem.id == item.inventory_item_id).first()
        if inv:
            qty_before = inv.current_stock
            inv.current_stock -= item.quantity
            db.add(InventoryMovement(
                item_id=inv.id,
                movement_type=MovementType.return_order,
                quantity=-item.quantity,
                quantity_before=qty_before,
                quantity_after=inv.current_stock,
                unit_cost=item.unit_cost,
                reference_type="purchase_deleted",
                reference_id=p.id,
                user_id=current_user.id,
            ))

    db.add(AuditLog(
        user_id=current_user.id,
        action="delete_purchase",
        entity_type="purchase",
        entity_id=p.id,
        old_value={"purchase_number": p.purchase_number, "total": str(p.total)},
    ))

    # Eliminar items y luego la compra
    for item in list(p.items):
        db.delete(item)
    db.delete(p)
    db.commit()
    return {"ok": True, "deleted": purchase_id}
