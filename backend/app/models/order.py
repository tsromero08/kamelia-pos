from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Numeric, Text, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base_class import Base
import enum


class OrderStatus(str, enum.Enum):
    pending = "pending"
    in_preparation = "in_preparation"
    ready = "ready"
    delivered = "delivered"
    cancelled = "cancelled"


class PaymentMethod(str, enum.Enum):
    cash = "cash"
    card = "card"
    transfer = "transfer"
    digital_wallet = "digital_wallet"
    nequi = "nequi"
    daviplata = "daviplata"
    courtesy = "courtesy"
    mixed = "mixed"          # pago dividido en varios métodos
    other = "other"


class OrderType(str, enum.Enum):
    dine_in = "dine_in"
    takeaway = "takeaway"
    delivery = "delivery"
    whatsapp = "whatsapp"


class DeliveryMode(str, enum.Enum):
    """Conciliación contable de domicilios (Bloque 3)."""
    none = "none"          # sin domicilio
    external = "external"  # repartidor externo cobra al cliente — solo registra producto
    managed = "managed"    # local cobra el envío — crea pasivo/gasto automático


class CustomerType(str, enum.Enum):
    natural = "natural"
    juridica = "juridica"


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    order_number = Column(String(20), unique=True, nullable=False, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True)
    cashier_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    status = Column(Enum(OrderStatus), default=OrderStatus.pending)
    order_type = Column(Enum(OrderType), default=OrderType.dine_in)
    subtotal = Column(Numeric(12, 2), default=0)
    discount = Column(Numeric(12, 2), default=0)
    tax = Column(Numeric(12, 2), default=0)
    total = Column(Numeric(12, 2), default=0)
    notes = Column(Text)
    table_number = Column(String(20))
    delivery_address = Column(Text)
    inventory_discounted = Column(Boolean, default=False)

    # Bloque 2: cortesía (precio $0, descuenta inventario normal)
    is_courtesy = Column(Boolean, default=False, nullable=False)

    # Bloque 3: domicilios con conciliación contable
    delivery_mode = Column(Enum(DeliveryMode), default=DeliveryMode.none, nullable=False)
    delivery_fee = Column(Numeric(12, 2), default=0, nullable=False)

    # Bloque 4: datos fiscales del cliente
    customer_type = Column(Enum(CustomerType), default=CustomerType.natural, nullable=False)
    tax_type = Column(String(80))  # ej. "Régimen Simple", "Responsable IVA", "No responsable"
    tax_id = Column(String(40))    # NIT o cédula

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    preparation_started_at = Column(DateTime(timezone=True), nullable=True)
    delivered_at = Column(DateTime(timezone=True))

    customer = relationship("Customer", back_populates="orders")
    cashier = relationship("User", back_populates="orders")
    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")
    payment = relationship("Payment", back_populates="order", uselist=False)
    status_history = relationship("OrderStatusHistory", back_populates="order", order_by="OrderStatusHistory.changed_at")


class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    variant_id = Column(Integer, ForeignKey("product_variants.id"), nullable=False)
    quantity = Column(Integer, nullable=False, default=1)
    unit_price = Column(Numeric(12, 2), nullable=False)
    subtotal = Column(Numeric(12, 2), nullable=False)
    notes = Column(Text)
    cooking_point = Column(String(20), default="none")  # roja/medio_roja/medio/tres_cuartos/bien_hecha
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    order = relationship("Order", back_populates="items")
    variant = relationship("ProductVariant", back_populates="order_items")
    modifiers = relationship("OrderItemModifier", back_populates="order_item", cascade="all, delete-orphan")
    selected_options = relationship("OrderItemOption", back_populates="order_item", cascade="all, delete-orphan")


class OrderItemModifier(Base):
    """Extra or removed ingredients on an order item"""
    __tablename__ = "order_item_modifiers"

    id = Column(Integer, primary_key=True, index=True)
    order_item_id = Column(Integer, ForeignKey("order_items.id"), nullable=False)
    inventory_item_id = Column(Integer, ForeignKey("inventory_items.id"), nullable=True)
    modifier_type = Column(String(20), nullable=False)  # "extra", "remove"
    name = Column(String(150), nullable=False)
    quantity = Column(Numeric(14, 4), default=0)
    additional_price = Column(Numeric(12, 2), default=0)

    order_item = relationship("OrderItem", back_populates="modifiers")
    inventory_item = relationship("InventoryItem")


class OrderItemOption(Base):
    """Selected option for an order item (e.g., Hades: 'Doble Carne')"""
    __tablename__ = "order_item_options"

    id = Column(Integer, primary_key=True, index=True)
    order_item_id = Column(Integer, ForeignKey("order_items.id"), nullable=False)
    option_id = Column(Integer, ForeignKey("product_options.id"), nullable=False)
    additional_price = Column(Numeric(12, 2), default=0)

    order_item = relationship("OrderItem", back_populates="selected_options")
    option = relationship("ProductOption")


class OrderStatusHistory(Base):
    __tablename__ = "order_status_history"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    status = Column(Enum(OrderStatus), nullable=False)
    changed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    notes = Column(String(300))
    changed_at = Column(DateTime(timezone=True), server_default=func.now())

    order = relationship("Order", back_populates="status_history")


class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), unique=True, nullable=False)
    invoice_number = Column(String(20), unique=True, nullable=True, index=True)
    payment_method = Column(Enum(PaymentMethod), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    change_given = Column(Numeric(12, 2), default=0)
    reference = Column(String(200))
    notes = Column(Text)
    is_split = Column(Boolean, default=False, nullable=False)  # Bloque 4: split payment
    cash_session_id = Column(Integer, ForeignKey("cash_sessions.id"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    order = relationship("Order", back_populates="payment")
    splits = relationship("PaymentSplit", back_populates="payment", cascade="all, delete-orphan")


class PaymentSplit(Base):
    """
    Desglose de un pago en varios métodos (Bloque 4).
    Cuando Payment.is_split=True, payment_method='mixed' y la lista
    de splits suma exactamente Payment.amount.
    """
    __tablename__ = "payment_splits"

    id = Column(Integer, primary_key=True, index=True)
    payment_id = Column(Integer, ForeignKey("payments.id"), nullable=False)
    payment_method = Column(Enum(PaymentMethod), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    reference = Column(String(200))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    payment = relationship("Payment", back_populates="splits")
