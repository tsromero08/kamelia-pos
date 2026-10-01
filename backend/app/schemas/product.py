from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from decimal import Decimal
from app.models.product import ProductType


class CategoryBase(BaseModel):
    name: str
    description: Optional[str] = None
    sort_order: int = 0
    is_active: bool = True


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class CategoryOut(CategoryBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class ProductOptionBase(BaseModel):
    name: str
    additional_price: Decimal = Decimal("0")
    is_active: bool = True


class ProductOptionCreate(ProductOptionBase):
    group_id: int


class ProductOptionOut(ProductOptionBase):
    id: int
    group_id: int
    created_at: datetime

    class Config:
        from_attributes = True


class ProductOptionGroupBase(BaseModel):
    name: str
    description: Optional[str] = None
    is_required: bool = False
    min_selections: int = 0
    max_selections: int = 1


class ProductOptionGroupCreate(ProductOptionGroupBase):
    product_id: int
    options: Optional[List[ProductOptionBase]] = []


class ProductOptionGroupOut(ProductOptionGroupBase):
    id: int
    product_id: int
    options: List[ProductOptionOut] = []
    created_at: datetime

    class Config:
        from_attributes = True


class ProductVariantBase(BaseModel):
    name: str
    price: Decimal
    is_combo: bool = False
    is_active: bool = True
    sort_order: int = 0


class ProductVariantCreate(ProductVariantBase):
    product_id: int


class ProductVariantUpdate(BaseModel):
    name: Optional[str] = None
    price: Optional[Decimal] = None
    is_combo: Optional[bool] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


class ProductVariantOut(ProductVariantBase):
    id: int
    product_id: int
    created_at: datetime

    class Config:
        from_attributes = True


class ProductBase(BaseModel):
    name: str
    description: Optional[str] = None
    category_id: int
    product_type: ProductType = ProductType.burger
    image_url: Optional[str] = None
    is_active: bool = True
    has_combo: bool = False
    preparation_time_min: int = 15
    sort_order: int = 0


class ProductCreate(ProductBase):
    variants: Optional[List[ProductVariantBase]] = []


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category_id: Optional[int] = None
    product_type: Optional[ProductType] = None
    image_url: Optional[str] = None
    is_active: Optional[bool] = None
    has_combo: Optional[bool] = None
    preparation_time_min: Optional[int] = None
    sort_order: Optional[int] = None


class ProductOut(ProductBase):
    id: int
    created_at: datetime
    category: Optional[CategoryOut] = None
    variants: List[ProductVariantOut] = []
    option_groups: List[ProductOptionGroupOut] = []

    class Config:
        from_attributes = True
