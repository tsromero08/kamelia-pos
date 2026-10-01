"""
Endpoints de despacho — 4 colas independientes.
Asignación FIFO automática con lock anti-duplicado.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from app.db.session import get_db
from app.api.deps import get_current_user, get_admin
from app.services import kitchen_service as ks
from app.schemas.kitchen import (
    DispatchSendIn, DispatcherShiftIn, DispatcherShiftOut,
)

router = APIRouter()


@router.get("/{queue_type}/list")
def list_queue(queue_type: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    return ks.dispatch_list(db, queue_type)


@router.get("/{queue_type}/my-assignment")
def my_assignment(
    queue_type: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    Devuelve el pedido asignado al despachador actual.
    Si no tiene, auto-asigna el siguiente FIFO. Si la cola está vacía → null.
    """
    result = ks.dispatch_my_assignment(db, queue_type, user.id)
    return result or {"queue_id": None, "message": "Cola vacía"}


@router.post("/{queue_id}/send")
def send_dispatch(
    queue_id: int,
    data: DispatchSendIn,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    try:
        return ks.dispatch_send(db, queue_id, user.id, data.notes)
    except ValueError as e:
        raise HTTPException(400, str(e))


# ─── Shifts (despachadores activos por cola) ────────────────────────────
@router.get("/shifts")
def list_shifts(
    queue_type: Optional[str] = None,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    return ks.active_dispatchers(db, queue_type)


@router.post("/shifts")
def set_shift(
    data: DispatcherShiftIn,
    db: Session = Depends(get_db),
    _=Depends(get_admin),
):
    try:
        return ks.dispatcher_shift_set(db, data.user_id, data.queue_type, data.is_active)
    except ValueError as e:
        raise HTTPException(400, str(e))
