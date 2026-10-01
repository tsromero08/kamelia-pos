from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from decimal import Decimal


class RecipeItemBase(BaseModel):
    inventory_item_id: int
    quantity: Decimal
    is_optional: bool = False
    deduct_if_removed: bool = False
    notes: Optional[str] = None


class RecipeItemCreate(RecipeItemBase):
    pass


class RecipeItemOut(RecipeItemBase):
    id: int
    recipe_id: int
    created_at: datetime

    class Config:
        from_attributes = True


class RecipeBase(BaseModel):
    variant_id: int
    notes: Optional[str] = None
    is_active: bool = True


class RecipeCreate(RecipeBase):
    items: List[RecipeItemCreate] = []


class RecipeUpdate(BaseModel):
    notes: Optional[str] = None
    is_active: Optional[bool] = None
    items: Optional[List[RecipeItemCreate]] = None


class RecipeOut(RecipeBase):
    id: int
    created_at: datetime
    items: List[RecipeItemOut] = []
    estimated_cost: Optional[Decimal] = None

    class Config:
        from_attributes = True


class ComboComponentBase(BaseModel):
    name: str
    inventory_item_id: int
    quantity: Decimal
    is_active: bool = True


class ComboComponentCreate(ComboComponentBase):
    pass


class ComboComponentOut(ComboComponentBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True
