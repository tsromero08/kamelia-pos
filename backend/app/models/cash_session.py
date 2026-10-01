"""
Sesiones de caja (apertura / cierre por turno).
Cada cajero abre una sesión con una BASE INICIAL (efectivo en cajón),
realiza pagos durante su turno, y al cierre cuenta el efectivo físico.
El sistema calcula expected_cash y la discrepancia.
"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Numeric, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base_class import Base


class CashSession(Base):
    __tablename__ = "cash_sessions"

    id = Column(Integer, primary_key=True, index=True)
    cashier_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    opened_at = Column(DateTime(timezone=True), server_default=func.now())
    closed_at = Column(DateTime(timezone=True), nullable=True)

    initial_cash = Column(Numeric(12, 2), default=0, nullable=False)   # base de apertura
    counted_cash = Column(Numeric(12, 2), nullable=True)               # conteo manual al cierre
    expected_cash = Column(Numeric(12, 2), nullable=True)              # calculado por sistema
    discrepancy = Column(Numeric(12, 2), nullable=True)                # counted - expected

    status = Column(String(20), default="open", nullable=False, index=True)  # open | closed
    opening_notes = Column(Text)
    closing_notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    cashier = relationship("User")
