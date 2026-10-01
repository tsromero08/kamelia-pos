from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime
from decimal import Decimal
from app.db.session import get_db
from app.schemas.financial import StockLossCreate, StockLossOut
from app.models.financial import StockLoss
from app.models.inventory import InventoryItem
from app.services.inventory_service import apply_stock_adjustment
from app.models.inventory import MovementType
from app.api.deps import get_current_user

router = APIRouter()


@router.get("/", response_model=List[StockLossOut])
def list_losses(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(StockLoss).order_by(StockLoss.loss_date.desc()).limit(100).all()


@router.post("/", response_model=StockLossOut)
def register_loss(data: StockLossCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    item = db.query(InventoryItem).filter(InventoryItem.id == data.inventory_item_id).first()
    if not item:
        raise HTTPException(404, "Inventory item not found")

    total_cost = data.quantity * item.current_cost

    loss = StockLoss(
        inventory_item_id=data.inventory_item_id,
        quantity=data.quantity,
        unit_cost=item.current_cost,
        total_cost=total_cost,
        loss_type=data.loss_type,
        description=data.description,
        recorded_by_id=current_user.id,
        loss_date=data.loss_date or datetime.utcnow(),
    )
    db.add(loss)
    db.flush()

    # Deduct from inventory
    apply_stock_adjustment(
        db, data.inventory_item_id, -data.quantity,
        MovementType.waste, current_user.id,
        notes=f"Pérdida/merma: {data.loss_type} - {data.description}",
        reference_id=loss.id,
    )

    db.commit()
    db.refresh(loss)
    return loss
