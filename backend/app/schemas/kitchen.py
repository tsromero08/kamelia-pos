from __future__ import annotations
from typing import Optional, List, Literal
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, Field


# ─── Stations ────────────────────────────────────────────────────────────
class KitchenStationOut(BaseModel):
    id: int
    key: str
    display_name: str
    color: str
    max_concurrent: int
    is_active: bool
    sort_order: int

    class Config:
        from_attributes = True


class StationUpdate(BaseModel):
    display_name: Optional[str] = None
    color: Optional[str] = None
    max_concurrent: Optional[int] = None
    is_active: Optional[bool] = None


# ─── Item-station route ──────────────────────────────────────────────────
class OrderItemStationOut(BaseModel):
    id: int
    order_item_id: int
    station_id: int
    station_key: str
    sequence: int
    status: str
    enqueued_at: Optional[datetime] = None
    in_prep_at: Optional[datetime] = None
    ready_at: Optional[datetime] = None
    dispatched_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ─── Totals payload (pantallas de cocina) ────────────────────────────────
class TotalsRow(BaseModel):
    product_name: str
    variant_name: str
    cooking_point: str = "none"
    pending_qty: int = 0       # qty en queued
    in_prep_qty: int = 0       # qty siendo preparada
    total_qty: int = 0         # pending + in_prep (lo que falta sacar)
    earliest_due_at: Optional[datetime] = None  # cuándo debería estar listo
    longest_wait_seconds: int = 0


class StationTotalsOut(BaseModel):
    station_key: str
    station_name: str
    color: str
    rows: List[TotalsRow]
    orders_in_queue: int = 0
    orders_in_prep: int = 0
    generated_at: datetime


# ─── Neveras: pedido-por-pedido ──────────────────────────────────────────
class NeverasItemOut(BaseModel):
    order_item_id: int
    variant_id: int
    product_name: str
    variant_name: str
    quantity: int
    cooking_point: str = "none"
    target_station: str  # parrilla/sudados/fritos
    notes: Optional[str] = None


class NeverasOrderOut(BaseModel):
    order_id: int
    order_number: str
    table_number: Optional[str] = None
    created_at: datetime
    waiting_seconds: int
    items: List[NeverasItemOut]
    status: str  # queued | in_prep | ready


# ─── Pantalla simple por estación (entradas/sopas/barra) ────────────────
class StationItemOut(BaseModel):
    item_station_id: int
    order_id: int
    order_number: str
    table_number: Optional[str] = None
    product_name: str
    variant_name: str
    quantity: int
    cooking_point: str = "none"
    notes: Optional[str] = None
    status: str
    enqueued_at: datetime
    waiting_seconds: int
    estimated_minutes: int


# ─── Dispatch ───────────────────────────────────────────────────────────
class DispatchAssignmentOut(BaseModel):
    queue_id: int
    order_id: int
    order_number: str
    table_number: Optional[str] = None
    queue_type: str
    items: List[dict]
    assigned_at: Optional[datetime] = None
    waiting_seconds: int


class DispatchSendIn(BaseModel):
    notes: Optional[str] = None


class DispatcherShiftIn(BaseModel):
    user_id: int
    queue_type: str
    is_active: bool = True


class DispatcherShiftOut(BaseModel):
    id: int
    user_id: int
    user_name: str
    queue_type: str
    is_active: bool
    started_at: datetime
    ended_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ─── Product config (admin) ─────────────────────────────────────────────
class ProductKitchenConfig(BaseModel):
    kitchen_section: str
    preparation_time_min: int = Field(default=15, ge=0, le=240)
    requires_neveras: bool = False
    requires_cooking_point: bool = False
    is_sold_out: bool = False
