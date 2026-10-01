from pydantic import BaseModel, field_serializer
from typing import Optional, List
from datetime import datetime, timezone
from decimal import Decimal
from app.models.order import OrderStatus, PaymentMethod, OrderType, DeliveryMode, CustomerType


def _iso_utc(dt: Optional[datetime]) -> Optional[str]:
    """
    Serializa datetimes garantizando que SIEMPRE incluyan zona UTC ('Z').
    El backend almacena tiempos en UTC (func.now / datetime.utcnow) pero
    en SQLite vienen naive — sin esto el frontend los interpreta como
    hora local y los cronómetros se rompen.
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


class OrderItemModifierIn(BaseModel):
    inventory_item_id: Optional[int] = None
    modifier_type: str  # "extra" or "remove"
    name: str
    quantity: Decimal = Decimal("0")
    additional_price: Decimal = Decimal("0")


class OrderItemOptionIn(BaseModel):
    option_id: int


class OrderItemCreate(BaseModel):
    variant_id: int
    quantity: int = 1
    notes: Optional[str] = None
    cooking_point: Optional[str] = "none"
    modifiers: List[OrderItemModifierIn] = []
    selected_options: List[OrderItemOptionIn] = []


class OrderCreate(BaseModel):
    customer_id: Optional[int] = None
    order_type: OrderType = OrderType.dine_in
    table_number: Optional[str] = None
    delivery_address: Optional[str] = None
    notes: Optional[str] = None
    discount: Decimal = Decimal("0")
    items: List[OrderItemCreate]

    # Bloque 2: cortesía
    is_courtesy: bool = False

    # Bloque 3: domicilios
    delivery_mode: DeliveryMode = DeliveryMode.none
    delivery_fee: Decimal = Decimal("0")

    # Bloque 4: datos fiscales
    customer_type: CustomerType = CustomerType.natural
    tax_type: Optional[str] = None
    tax_id: Optional[str] = None


class PaymentSplitIn(BaseModel):
    payment_method: PaymentMethod
    amount: Decimal
    reference: Optional[str] = None


class PaymentCreate(BaseModel):
    payment_method: PaymentMethod
    amount: Decimal
    change_given: Decimal = Decimal("0")
    reference: Optional[str] = None
    notes: Optional[str] = None
    # Bloque 4: split payment — si splits está presente, payment_method se fuerza a 'mixed'
    splits: Optional[List[PaymentSplitIn]] = None
    # Rancho La Kamelia: propina (10% sugerido, modificable)
    tip_amount: Optional[Decimal] = Decimal("0")
    tip_percent: Optional[Decimal] = Decimal("0")


class PaymentSplitOut(BaseModel):
    id: int
    payment_method: PaymentMethod
    amount: Decimal
    reference: Optional[str] = None

    class Config:
        from_attributes = True


class OrderItemModifierOut(BaseModel):
    id: int
    modifier_type: str
    name: str
    quantity: Decimal
    additional_price: Decimal

    class Config:
        from_attributes = True


class OrderItemOptionOut(BaseModel):
    id: int
    option_id: int
    additional_price: Decimal

    class Config:
        from_attributes = True


class OrderItemOut(BaseModel):
    id: int
    variant_id: int
    quantity: int
    unit_price: Decimal
    subtotal: Decimal
    notes: Optional[str] = None
    modifiers: List[OrderItemModifierOut] = []
    selected_options: List[OrderItemOptionOut] = []

    class Config:
        from_attributes = True


class PaymentOut(BaseModel):
    id: int
    invoice_number: Optional[str] = None
    payment_method: PaymentMethod
    amount: Decimal
    change_given: Decimal
    reference: Optional[str] = None
    is_split: bool = False
    splits: List[PaymentSplitOut] = []
    created_at: datetime

    @field_serializer("created_at")
    def _ser_created_at(self, v: datetime) -> Optional[str]:
        return _iso_utc(v)

    class Config:
        from_attributes = True


class CustomerMini(BaseModel):
    id: int
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None

    class Config:
        from_attributes = True


class OrderOut(BaseModel):
    id: int
    order_number: str
    customer_id: Optional[int] = None
    cashier_id: Optional[int] = None
    status: OrderStatus
    order_type: OrderType
    subtotal: Decimal
    discount: Decimal
    tax: Decimal
    total: Decimal
    notes: Optional[str] = None
    table_number: Optional[str] = None
    delivery_address: Optional[str] = None
    is_courtesy: bool = False
    delivery_mode: DeliveryMode = DeliveryMode.none
    delivery_fee: Decimal = Decimal("0")
    customer_type: CustomerType = CustomerType.natural
    tax_type: Optional[str] = None
    tax_id: Optional[str] = None
    items: List[OrderItemOut] = []
    payment: Optional[PaymentOut] = None
    customer: Optional[CustomerMini] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    preparation_started_at: Optional[datetime] = None

    @field_serializer("created_at", "updated_at", "preparation_started_at")
    def _ser_dates(self, v: Optional[datetime]) -> Optional[str]:
        return _iso_utc(v)

    class Config:
        from_attributes = True


class OrderStatusUpdate(BaseModel):
    status: OrderStatus
    notes: Optional[str] = None
