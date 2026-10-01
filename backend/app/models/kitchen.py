"""
Modelos del sistema de cocina por estaciones para Rancho La Kamelia.

Flujo:
  POS → NEVERAS (alistamiento central) → PARRILLA/SUDADOS/FRITOS (cocción)
       → EMPLATAMIENTO (totales consolidados) → DESPACHO PRINCIPAL → mesa

Sub-flujos paralelos independientes:
  POS → ENTRADAS → DESPACHO ENTRADAS → mesa
  POS → SOPAS    → DESPACHO SOPAS    → mesa
  POS → BARRA    → DESPACHO BEBIDAS  → mesa
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Enum, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base_class import Base
import enum


class StationKey(str, enum.Enum):
    """Estaciones de la cocina del rancho. Una por sección física."""
    neveras       = "neveras"
    parrilla      = "parrilla"
    sudados       = "sudados"
    fritos        = "fritos"
    emplatamiento = "emplatamiento"
    entradas      = "entradas"
    sopas         = "sopas"
    barra         = "barra"


class DispatchQueueType(str, enum.Enum):
    """Las 4 colas de despacho. Principales tiene varios despachadores; las otras 1 cada una."""
    principal = "principal"
    entradas  = "entradas"
    sopas     = "sopas"
    bebidas   = "bebidas"


class StationItemStatus(str, enum.Enum):
    queued     = "queued"      # encolado en la estación
    in_prep    = "in_prep"     # preparándose
    ready      = "ready"       # listo para emplatamiento / despacho
    dispatched = "dispatched"  # ya salió del flujo


class DispatchStatus(str, enum.Enum):
    queued     = "queued"      # en cola, sin despachador asignado
    assigned   = "assigned"    # asignado a un despachador (lock)
    dispatched = "dispatched"  # enviado al mesero / mesa
    cancelled  = "cancelled"


class CookingPoint(str, enum.Enum):
    """Punto de cocción para cortes. Va en pantalla de totales de parrilla."""
    none         = "none"
    roja         = "roja"
    medio_roja   = "medio_roja"
    medio        = "medio"
    tres_cuartos = "tres_cuartos"
    bien_hecha   = "bien_hecha"


# ────────────────────────────────────────────────────────────────────────
class KitchenStation(Base):
    """
    Una estación física de la cocina. Sembradas al startup.
    `max_concurrent` = throughput máximo (cuántos pedidos puede procesar a la vez).
    Si se excede, los siguientes esperan en neveras (para principales) o
    se acumulan en la propia cola (entradas/sopas/bebidas).
    """
    __tablename__ = "kitchen_stations"

    id              = Column(Integer, primary_key=True, index=True)
    key             = Column(Enum(StationKey), unique=True, nullable=False, index=True)
    display_name    = Column(String(80), nullable=False)
    color           = Column(String(20), default="#d4af37")
    max_concurrent  = Column(Integer, default=10)
    is_active       = Column(Boolean, default=True)
    sort_order      = Column(Integer, default=0)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    item_routes = relationship("OrderItemStation", back_populates="station", cascade="all, delete-orphan")


class OrderItemStation(Base):
    """
    Ruteo de un OrderItem a una estación específica.
    Un mismo item puede ir a MÚLTIPLES estaciones (ej. neveras → parrilla → emplatamiento).
    Cada paso registra timestamps para reportes y alertas de retraso.
    """
    __tablename__ = "order_item_stations"

    id             = Column(Integer, primary_key=True, index=True)
    order_item_id  = Column(Integer, ForeignKey("order_items.id"), nullable=False, index=True)
    station_id     = Column(Integer, ForeignKey("kitchen_stations.id"), nullable=False, index=True)
    sequence       = Column(Integer, default=0)  # orden de paso (neveras=0, cocción=1, emplatamiento=2)
    status         = Column(Enum(StationItemStatus), default=StationItemStatus.queued, nullable=False, index=True)

    enqueued_at    = Column(DateTime(timezone=True), server_default=func.now())
    in_prep_at     = Column(DateTime(timezone=True), nullable=True)
    ready_at       = Column(DateTime(timezone=True), nullable=True)
    dispatched_at  = Column(DateTime(timezone=True), nullable=True)

    operator_id    = Column(Integer, ForeignKey("users.id"), nullable=True)
    notes          = Column(Text)

    station        = relationship("KitchenStation", back_populates="item_routes")
    order_item     = relationship("OrderItem")


class DispatchQueue(Base):
    """
    Cola de despacho por tipo (principal/entradas/sopas/bebidas).
    Asignación FIFO automática: cuando un despachador termina, el sistema
    le asigna el siguiente pendiente. Lock vía `assigned_to_id` previene
    que dos despachadores tomen el mismo pedido.
    """
    __tablename__ = "dispatch_queues"

    id                = Column(Integer, primary_key=True, index=True)
    order_id          = Column(Integer, ForeignKey("orders.id"), nullable=False, index=True)
    queue_type        = Column(Enum(DispatchQueueType), nullable=False, index=True)
    status            = Column(Enum(DispatchStatus), default=DispatchStatus.queued, nullable=False, index=True)

    created_at        = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    assigned_to_id    = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    assigned_at       = Column(DateTime(timezone=True), nullable=True)
    dispatched_at     = Column(DateTime(timezone=True), nullable=True)
    dispatched_by_id  = Column(Integer, ForeignKey("users.id"), nullable=True)

    notes             = Column(Text)

    order             = relationship("Order")


class DispatcherShift(Base):
    """
    Despachadores activos en una cola.
    Mientras `is_active=True`, el sistema los considera para asignación
    round-robin. Soporta varios despachadores en PRINCIPAL, uno en
    cada uno de los otros (configurable).
    """
    __tablename__ = "dispatcher_shifts"

    id          = Column(Integer, primary_key=True, index=True)
    user_id     = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    queue_type  = Column(Enum(DispatchQueueType), nullable=False, index=True)
    is_active   = Column(Boolean, default=True, index=True)
    started_at  = Column(DateTime(timezone=True), server_default=func.now())
    ended_at    = Column(DateTime(timezone=True), nullable=True)
