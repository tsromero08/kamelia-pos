from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Numeric, Text, Enum, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base_class import Base
import enum


class LossType(str, enum.Enum):
    waste = "waste"
    damage = "damage"
    expiry = "expiry"
    return_order = "return_order"
    courtesy = "courtesy"
    internal_use = "internal_use"
    kitchen_error = "kitchen_error"
    other = "other"


class StockLoss(Base):
    """Records losses, waste, and non-sale inventory exits"""
    __tablename__ = "stock_losses"

    id = Column(Integer, primary_key=True, index=True)
    inventory_item_id = Column(Integer, ForeignKey("inventory_items.id"), nullable=False)
    quantity = Column(Numeric(14, 4), nullable=False)
    unit_cost = Column(Numeric(12, 4))
    total_cost = Column(Numeric(12, 4))
    loss_type = Column(Enum(LossType), nullable=False)
    description = Column(String(300))
    recorded_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    loss_date = Column(DateTime(timezone=True), server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    inventory_item = relationship("InventoryItem")
    recorded_by = relationship("User")


class MonthlySummary(Base):
    """Pre-calculated monthly financial summary for fast reporting"""
    __tablename__ = "monthly_summaries"

    id = Column(Integer, primary_key=True, index=True)
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    total_sales = Column(Numeric(14, 2), default=0)
    total_orders = Column(Integer, default=0)
    avg_ticket = Column(Numeric(12, 2), default=0)
    estimated_cogs = Column(Numeric(14, 2), default=0)
    total_purchases = Column(Numeric(14, 2), default=0)
    total_expenses = Column(Numeric(14, 2), default=0)
    total_losses = Column(Numeric(14, 2), default=0)
    gross_profit = Column(Numeric(14, 2), default=0)
    net_profit = Column(Numeric(14, 2), default=0)
    gross_margin_pct = Column(Numeric(6, 2), default=0)
    net_margin_pct = Column(Numeric(6, 2), default=0)
    calculated_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        {"sqlite_autoincrement": False},
    )


class DailySummary(Base):
    """Daily closing snapshot — one record per day once closed"""
    __tablename__ = "daily_summaries"

    id = Column(Integer, primary_key=True, index=True)
    summary_date = Column(String(10), nullable=False, unique=True)  # YYYY-MM-DD
    total_sales = Column(Numeric(14, 2), default=0)
    total_orders = Column(Integer, default=0)
    avg_ticket = Column(Numeric(12, 2), default=0)
    estimated_cogs = Column(Numeric(14, 2), default=0)
    total_purchases = Column(Numeric(14, 2), default=0)
    total_expenses = Column(Numeric(14, 2), default=0)
    total_losses = Column(Numeric(14, 2), default=0)
    gross_profit = Column(Numeric(14, 2), default=0)
    net_profit = Column(Numeric(14, 2), default=0)
    gross_margin_pct = Column(Numeric(6, 2), default=0)
    net_margin_pct = Column(Numeric(6, 2), default=0)
    notes = Column(Text, nullable=True)
    # Detalle adicional para auditoría: métodos de pago + productos vendidos
    payment_methods = Column(JSON, nullable=True)   # {"cash": 120000, "card": 80000}
    products_sold = Column(JSON, nullable=True)     # [{"name": "Hamburguesa Hades", "qty": 12, "total": 144000}, ...]
    closed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    closed_at = Column(DateTime(timezone=True), server_default=func.now())

    closed_by = relationship("User")
