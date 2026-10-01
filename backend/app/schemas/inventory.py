from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from decimal import Decimal
from app.models.inventory import MovementType


class UnitOfMeasureBase(BaseModel):
    name: str
    abbreviation: str


class UnitOfMeasureCreate(UnitOfMeasureBase):
    pass


class UnitOfMeasureOut(UnitOfMeasureBase):
    id: int

    class Config:
        from_attributes = True


class SupplierBase(BaseModel):
    name: str
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    is_active: bool = True


class SupplierCreate(SupplierBase):
    pass


class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class SupplierOut(SupplierBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class InventoryItemBase(BaseModel):
    name: str
    description: Optional[str] = None
    unit_id: int
    current_stock: Decimal = Decimal("0")
    minimum_stock: Decimal = Decimal("0")
    current_cost: Decimal = Decimal("0")
    preferred_supplier_id: Optional[int] = None
    is_active: bool = True
    notes: Optional[str] = None


class InventoryItemCreate(InventoryItemBase):
    pass


class InventoryItemUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    unit_id: Optional[int] = None
    minimum_stock: Optional[Decimal] = None
    current_cost: Optional[Decimal] = None
    preferred_supplier_id: Optional[int] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class InventoryItemOut(InventoryItemBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    unit: Optional[UnitOfMeasureOut] = None
    preferred_supplier: Optional[SupplierOut] = None
    is_low_stock: bool = False

    class Config:
        from_attributes = True


class InventoryMovementOut(BaseModel):
    id: int
    item_id: int
    movement_type: MovementType
    quantity: Decimal
    quantity_before: Optional[Decimal] = None
    quantity_after: Optional[Decimal] = None
    unit_cost: Optional[Decimal] = None
    reference_type: Optional[str] = None
    reference_id: Optional[int] = None
    notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class StockAdjustmentCreate(BaseModel):
    item_id: int
    quantity: Decimal
    notes: Optional[str] = None
