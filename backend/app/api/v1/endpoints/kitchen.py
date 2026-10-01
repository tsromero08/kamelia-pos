"""
Endpoints del sistema de cocina por estaciones para Rancho La Kamelia.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from app.db.session import get_db
from app.api.deps import get_current_user, get_admin
from app.models.kitchen import KitchenStation, StationKey
from app.models.product import Product
from app.services import kitchen_service as ks
from app.schemas.kitchen import (
    KitchenStationOut, StationUpdate, StationTotalsOut, ProductKitchenConfig,
)

router = APIRouter()


# ─── Stations CRUD ──────────────────────────────────────────────────────
@router.get("/stations", response_model=List[KitchenStationOut])
def list_stations(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(KitchenStation).order_by(KitchenStation.sort_order).all()


@router.patch("/stations/{station_id}", response_model=KitchenStationOut)
def update_station(
    station_id: int,
    data: StationUpdate,
    db: Session = Depends(get_db),
    _=Depends(get_admin),
):
    st = db.query(KitchenStation).filter(KitchenStation.id == station_id).first()
    if not st:
        raise HTTPException(404, "Estación no encontrada")
    for k, v in data.dict(exclude_unset=True).items():
        setattr(st, k, v)
    db.commit()
    db.refresh(st)
    return st


# ─── Totales de pantalla ────────────────────────────────────────────────
@router.get("/stations/{station_key}/totals")
def get_station_totals(
    station_key: str,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    if station_key == "emplatamiento":
        return ks.emplatamiento_totals(db)
    return ks.station_totals(db, station_key)


@router.get("/stations/{station_key}/items")
def get_station_items(
    station_key: str,
    limit: int = 100,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    return ks.list_station_items(db, station_key, limit=limit)


# ─── Neveras ────────────────────────────────────────────────────────────
@router.get("/neveras/queue")
def get_neveras_queue(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return ks.neveras_queue(db)


@router.post("/neveras/orders/{order_id}/complete")
def complete_neveras(
    order_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    ks.neveras_complete_order(db, order_id, user.id)
    return {"ok": True, "order_id": order_id}


# ─── Items: cambios de estado ──────────────────────────────────────────
@router.post("/items/{item_station_id}/in-prep")
def item_in_prep(
    item_station_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    return ks.mark_item_in_prep(db, item_station_id, user.id)


@router.post("/items/{item_station_id}/ready")
def item_ready(
    item_station_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    return ks.mark_item_ready(db, item_station_id, user.id)


# ─── Product kitchen config (admin) ─────────────────────────────────────
@router.get("/products/{product_id}/config", response_model=ProductKitchenConfig)
def get_product_config(product_id: int, db: Session = Depends(get_db), _=Depends(get_admin)):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(404, "Producto no encontrado")
    return ProductKitchenConfig(
        kitchen_section=p.kitchen_section or "entradas",
        preparation_time_min=p.preparation_time_min or 15,
        requires_neveras=p.requires_neveras,
        requires_cooking_point=p.requires_cooking_point,
        is_sold_out=p.is_sold_out,
    )


@router.put("/products/{product_id}/config", response_model=ProductKitchenConfig)
def set_product_config(
    product_id: int,
    cfg: ProductKitchenConfig,
    db: Session = Depends(get_db),
    _=Depends(get_admin),
):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(404, "Producto no encontrado")
    p.kitchen_section = cfg.kitchen_section
    p.preparation_time_min = cfg.preparation_time_min
    p.requires_neveras = cfg.requires_neveras
    p.requires_cooking_point = cfg.requires_cooking_point
    p.is_sold_out = cfg.is_sold_out
    db.commit()
    return cfg


@router.post("/products/{product_id}/toggle-sold-out")
def toggle_sold_out(product_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Botón rápido '86' desde cualquier pantalla de cocina."""
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(404, "Producto no encontrado")
    p.is_sold_out = not p.is_sold_out
    db.commit()
    return {"id": p.id, "is_sold_out": p.is_sold_out}
