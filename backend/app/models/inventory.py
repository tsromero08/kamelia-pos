from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Numeric, Text, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base_class import Base
import enum


class MovementType(str, enum.Enum):
    purchase = "purchase"
    sale = "sale"
    adjustment_positive = "adjustment_positive"
    adjustment_negative = "adjustment_negative"
    waste = "waste"
    internal_use = "internal_use"
    return_order = "return_order"
    initial = "initial"


class UnitOfMeasure(Base):
    __tablename__ = "units_of_measure"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, nullable=False)
    abbreviation = Column(String(10), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    inventory_items = relationship("InventoryItem", back_populates="unit")


class Supplier(Base):
    __tablename__ = "suppliers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    contact_name = Column(String(100))
    phone = Column(String(30))
    email = Column(String(200))
    address = Column(Text)
    notes = Column(Text)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    inventory_items = relationship("InventoryItem", back_populates="preferred_supplier")
    purchases = relationship("Purchase", back_populates="supplier")


class InventoryItem(Base):
    __tablename__ = "inventory_items"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    description = Column(Text)
    unit_id = Column(Integer, ForeignKey("units_of_measure.id"), nullable=False)
    current_stock = Column(Numeric(14, 4), default=0)
    minimum_stock = Column(Numeric(14, 4), default=0)
    current_cost = Column(Numeric(12, 4), default=0)  # cost per unit
    preferred_supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    unit = relationship("UnitOfMeasure", back_populates="inventory_items")
    preferred_supplier = relationship("Supplier", back_populates="inventory_items")
    movements = relationship("InventoryMovement", back_populates="item")
    recipe_items = relationship("RecipeItem", back_populates="inventory_item")
    purchase_items = relationship("PurchaseItem", back_populates="inventory_item")
    cost_history = relationship("InventoryCostHistory", back_populates="item", order_by="InventoryCostHistory.recorded_at.desc()")


class InventoryMovement(Base):
    __tablename__ = "inventory_movements"

    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(Integer, ForeignKey("inventory_items.id"), nullable=False)
    movement_type = Column(Enum(MovementType), nullable=False)
    quantity = Column(Numeric(14, 4), nullable=False)  # positive = in, negative = out
    quantity_before = Column(Numeric(14, 4))
    quantity_after = Column(Numeric(14, 4))
    unit_cost = Column(Numeric(12, 4))
    reference_type = Column(String(50))  # "order", "purchase", "adjustment"
    reference_id = Column(Integer)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    item = relationship("InventoryItem", back_populates="movements")
    user = relationship("User", back_populates="inventory_movements")


class InventoryCostHistory(Base):
    __tablename__ = "inventory_cost_history"

    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(Integer, ForeignKey("inventory_items.id"), nullable=False)
    cost = Column(Numeric(12, 4), nullable=False)
    recorded_at = Column(DateTime(timezone=True), server_default=func.now())
    source = Column(String(50))  # "purchase", "manual"
    notes = Column(Text)

    item = relationship("InventoryItem", back_populates="cost_history")


class InventoryBatch(Base):
    """
    Lote o tanda de un insumo (producto perecedero) con fecha de vencimiento.
    Implementa trazabilidad básica y FEFO (First-Expiring First-Out): el sistema
    siempre consume primero el lote más próximo a vencer.

    Modelo MVP:
    - Un mismo insumo puede tener varios lotes vivos a la vez.
    - Al comprar se registra un lote (opcional).
    - Al vender, el descuento prioriza el lote con expiry_date más cercana.
    - Si un lote llega a 0, se marca como agotado (queda como histórico).
    """
    __tablename__ = "inventory_batches"

    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(Integer, ForeignKey("inventory_items.id"), nullable=False, index=True)
    batch_code = Column(String(80))                      # opcional, ej. "L-2026-05-14-001"
    initial_quantity = Column(Numeric(14, 4), nullable=False)
    remaining_quantity = Column(Numeric(14, 4), nullable=False)
    unit_cost = Column(Numeric(12, 4), default=0)
    received_date = Column(DateTime(timezone=True), server_default=func.now())
    expiry_date = Column(DateTime(timezone=True), nullable=True, index=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=True)
    purchase_id = Column(Integer, ForeignKey("purchases.id"), nullable=True)
    is_depleted = Column(Boolean, default=False, index=True)
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    item = relationship("InventoryItem", backref="batches")
    supplier = relationship("Supplier")
