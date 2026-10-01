"""
Endpoints para apertura/cierre de caja por turno.
Cada cajero abre con una BASE INICIAL, hace ventas (los pagos en efectivo
se asocian a la sesión), y al cierre el sistema calcula:
  expected_cash = initial_cash + suma de pagos en efectivo del turno - cambios entregados
  discrepancy   = counted_cash - expected_cash
"""
from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.db.session import get_db
from app.api.deps import get_current_user
from app.models.cash_session import CashSession
from app.models.order import Payment, PaymentMethod, PaymentSplit, Order
from app.models.audit import AuditLog
from app.models.user import User

router = APIRouter()


class CashSessionOpen(BaseModel):
    initial_cash: Decimal
    opening_notes: Optional[str] = None


class CashSessionClose(BaseModel):
    counted_cash: Decimal
    closing_notes: Optional[str] = None


class CashSessionOut(BaseModel):
    id: int
    cashier_id: int
    cashier_name: Optional[str] = None
    opened_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    initial_cash: Decimal
    counted_cash: Optional[Decimal] = None
    expected_cash: Optional[Decimal] = None
    discrepancy: Optional[Decimal] = None
    status: str
    opening_notes: Optional[str] = None
    closing_notes: Optional[str] = None
    cash_sales: Optional[Decimal] = None        # ventas en efectivo del turno
    total_sales: Optional[Decimal] = None       # todas las ventas del turno
    payment_count: Optional[int] = None
    change_given: Optional[Decimal] = None

    class Config:
        from_attributes = True


def _session_totals(db: Session, session: CashSession) -> dict:
    """Calcula totales del turno: efectivo, total, cambio entregado, conteo."""
    end_dt = session.closed_at or datetime.utcnow()
    # Pagos atados a esta sesión
    payments = (
        db.query(Payment)
        .filter(Payment.cash_session_id == session.id)
        .all()
    )
    cash_total = Decimal("0")
    all_total = Decimal("0")
    change_total = Decimal("0")
    for p in payments:
        all_total += Decimal(str(p.amount or 0))
        change_total += Decimal(str(p.change_given or 0))
        # Pago simple en efectivo
        if p.payment_method == PaymentMethod.cash and not p.is_split:
            cash_total += Decimal(str(p.amount or 0))
        # Pago dividido: sumar splits cash
        if p.is_split:
            for s in p.splits or []:
                if s.payment_method == PaymentMethod.cash:
                    cash_total += Decimal(str(s.amount or 0))
    # En efectivo neto que debería estar en caja:
    expected = (session.initial_cash or Decimal("0")) + cash_total - change_total
    return {
        "cash_sales": cash_total,
        "total_sales": all_total,
        "change_given": change_total,
        "expected_cash": expected,
        "payment_count": len(payments),
    }


def _serialize(db: Session, s: CashSession) -> dict:
    totals = _session_totals(db, s)
    return {
        "id": s.id,
        "cashier_id": s.cashier_id,
        "cashier_name": s.cashier.name if s.cashier else None,
        "opened_at": s.opened_at,
        "closed_at": s.closed_at,
        "initial_cash": s.initial_cash,
        "counted_cash": s.counted_cash,
        "expected_cash": s.expected_cash if s.status == "closed" else totals["expected_cash"],
        "discrepancy": s.discrepancy,
        "status": s.status,
        "opening_notes": s.opening_notes,
        "closing_notes": s.closing_notes,
        "cash_sales": totals["cash_sales"],
        "total_sales": totals["total_sales"],
        "change_given": totals["change_given"],
        "payment_count": totals["payment_count"],
    }


@router.get("/current", response_model=Optional[CashSessionOut])
def my_current_session(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Devuelve la sesión abierta del cajero actual, o null si no hay."""
    s = (
        db.query(CashSession)
        .filter(CashSession.cashier_id == current_user.id, CashSession.status == "open")
        .first()
    )
    if not s:
        return None
    return _serialize(db, s)


@router.post("/open", response_model=CashSessionOut)
def open_session(
    data: CashSessionOpen,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Solo Administrador, Cajero, Mesero pueden abrir caja
    role = current_user.role.name if current_user.role else ""
    if role not in ("Administrador", "Cajero", "Mesero"):
        raise HTTPException(403, "Solo Administrador, Cajero o Mesero pueden abrir caja")
    if data.initial_cash < 0:
        raise HTTPException(400, "La base inicial no puede ser negativa")

    existing = (
        db.query(CashSession)
        .filter(CashSession.cashier_id == current_user.id, CashSession.status == "open")
        .first()
    )
    if existing:
        raise HTTPException(400, f"Ya tienes una sesión abierta (#{existing.id}) — debes cerrarla primero")

    s = CashSession(
        cashier_id=current_user.id,
        initial_cash=data.initial_cash,
        opening_notes=data.opening_notes,
        status="open",
    )
    db.add(s)
    db.flush()
    db.add(AuditLog(
        user_id=current_user.id, action="cash_session_open",
        entity_type="cash_session", entity_id=s.id,
        new_value={"initial_cash": str(data.initial_cash)},
    ))
    db.commit()
    db.refresh(s)
    return _serialize(db, s)


@router.post("/close", response_model=CashSessionOut)
def close_session(
    data: CashSessionClose,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    s = (
        db.query(CashSession)
        .filter(CashSession.cashier_id == current_user.id, CashSession.status == "open")
        .first()
    )
    if not s:
        raise HTTPException(400, "No tienes una sesión abierta para cerrar")

    totals = _session_totals(db, s)
    expected = totals["expected_cash"]
    discrepancy = Decimal(str(data.counted_cash)) - expected

    s.counted_cash = data.counted_cash
    s.expected_cash = expected
    s.discrepancy = discrepancy
    s.closing_notes = data.closing_notes
    s.status = "closed"
    s.closed_at = datetime.utcnow()

    db.add(AuditLog(
        user_id=current_user.id, action="cash_session_close",
        entity_type="cash_session", entity_id=s.id,
        new_value={
            "counted": str(data.counted_cash),
            "expected": str(expected),
            "discrepancy": str(discrepancy),
            "cash_sales": str(totals["cash_sales"]),
        },
    ))
    db.commit()
    db.refresh(s)
    return _serialize(db, s)


@router.get("/history", response_model=List[CashSessionOut])
def history(
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Historial de sesiones. Admin ve todas; cajero/mesero solo las suyas."""
    role = current_user.role.name if current_user.role else ""
    q = db.query(CashSession)
    if role != "Administrador":
        q = q.filter(CashSession.cashier_id == current_user.id)
    rows = q.order_by(CashSession.opened_at.desc()).limit(limit).all()
    return [_serialize(db, s) for s in rows]


@router.get("/{session_id}", response_model=CashSessionOut)
def get_session(session_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    s = db.query(CashSession).filter(CashSession.id == session_id).first()
    if not s:
        raise HTTPException(404, "Sesión no encontrada")
    role = current_user.role.name if current_user.role else ""
    if role != "Administrador" and s.cashier_id != current_user.id:
        raise HTTPException(403, "No puedes ver sesiones de otros cajeros")
    return _serialize(db, s)
