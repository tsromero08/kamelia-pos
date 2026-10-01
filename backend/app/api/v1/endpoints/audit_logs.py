"""
Endpoint para consultar el log de auditoría. SOLO Administrador.
Permite filtrar por usuario, acción, entidad y rango de fechas.
"""
from datetime import datetime, timedelta
from typing import Optional, List

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.api.deps import get_admin
from app.models.audit import AuditLog
from app.models.user import User


router = APIRouter()


class AuditLogOut(BaseModel):
    id: int
    user_id: Optional[int] = None
    user_name: Optional[str] = None
    action: str
    entity_type: Optional[str] = None
    entity_id: Optional[int] = None
    old_value: Optional[dict | list] = None
    new_value: Optional[dict | list] = None
    ip_address: Optional[str] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None


@router.get("/", response_model=List[AuditLogOut])
def list_logs(
    user_id: Optional[int] = None,
    action: Optional[str] = None,
    entity_type: Optional[str] = None,
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _: User = Depends(get_admin),
):
    """Lista de eventos de auditoría. Solo Admin."""
    cutoff = datetime.utcnow() - timedelta(days=days)
    q = db.query(AuditLog).filter(AuditLog.created_at >= cutoff)
    if user_id:
        q = q.filter(AuditLog.user_id == user_id)
    if action:
        q = q.filter(AuditLog.action == action)
    if entity_type:
        q = q.filter(AuditLog.entity_type == entity_type)
    rows = q.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit).all()
    out = []
    for r in rows:
        out.append({
            "id": r.id,
            "user_id": r.user_id,
            "user_name": r.user.name if r.user else None,
            "action": r.action,
            "entity_type": r.entity_type,
            "entity_id": r.entity_id,
            "old_value": r.old_value,
            "new_value": r.new_value,
            "ip_address": r.ip_address,
            "notes": r.notes,
            "created_at": r.created_at,
        })
    return out


@router.get("/actions", response_model=List[str])
def list_actions(db: Session = Depends(get_db), _: User = Depends(get_admin)):
    """Listado de acciones distintas registradas (para llenar dropdowns)."""
    return [r[0] for r in db.query(AuditLog.action).distinct().all() if r[0]]
