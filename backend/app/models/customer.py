from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base_class import Base


class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    phone = Column(String(30), index=True)
    email = Column(String(200))
    address = Column(Text)
    notes = Column(Text)
    is_active = Column(Boolean, default=True)
    # Bloque 4: datos fiscales persistentes (autocompletado en POS)
    tax_id = Column(String(40))  # NIT o cédula
    tax_type = Column(String(80))  # Régimen Simple, Responsable IVA, etc.
    customer_type = Column(String(20), default="natural")  # natural | juridica
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    orders = relationship("Order", back_populates="customer")
