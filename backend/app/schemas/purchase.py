from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from decimal import Decimal


class PurchaseItemCreate(BaseModel):
    inventory_item_id: int
    quantity: Decimal
    unit_cost: Decimal
    notes: Optional[str] = None


class PurchaseCreate(BaseModel):
    supplier_id: Optional[int] = None
    notes: Optional[str] = None
    purchase_date: Optional[datetime] = None
    items: List[PurchaseItemCreate]


class PurchaseItemOut(BaseModel):
    id: int
    inventory_item_id: int
    quantity: Decimal
    unit_cost: Decimal
    total_cost: Decimal
    notes: Optional[str] = None

    class Config:
        from_attributes = True


class PurchaseOut(BaseModel):
    id: int
    purchase_number: str
    supplier_id: Optional[int] = None
    created_by_id: Optional[int] = None
    total: Decimal
    notes: Optional[str] = None
    purchase_date: datetime
    created_at: datetime
    items: List[PurchaseItemOut] = []

    class Config:
        from_attributes = True
