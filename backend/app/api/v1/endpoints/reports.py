from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime, date, timezone, timedelta
from app.db.session import get_db

COLOMBIA_TZ = timezone(timedelta(hours=-5))


def _now_colombia():
    return datetime.now(COLOMBIA_TZ)
from app.schemas.financial import (
    FinancialSummary, DashboardMetrics, MonthlyComparison, ProductProfitability,
    DailySummaryOut, CloseDayRequest
)
from app.models.order import Order, OrderItem, OrderStatus, Payment, PaymentMethod
from app.models.product import Product, ProductVariant
from app.services.financial_service import (
    get_financial_summary, get_dashboard_metrics, get_monthly_comparison,
    get_product_profitability, close_day, get_daily_history, get_day_preview
)
from app.api.deps import get_current_user

router = APIRouter()


@router.get("/dashboard", response_model=DashboardMetrics)
def dashboard(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return get_dashboard_metrics(db)


@router.get("/financial-summary", response_model=FinancialSummary)
def financial_summary(
    start_date: datetime = None,
    end_date: datetime = None,
    db: Session = Depends(get_db),
    _=Depends(get_current_user)
):
    if not start_date:
        # Inicio del mes en hora Colombia → UTC
        today_col = _now_colombia().date()
        first = today_col.replace(day=1)
        start_date = datetime.combine(first, datetime.min.time(), tzinfo=COLOMBIA_TZ).astimezone(timezone.utc).replace(tzinfo=None)
    if not end_date:
        # Ahora en UTC (BD usa naive UTC)
        end_date = datetime.utcnow()
    return get_financial_summary(db, start_date, end_date)


@router.get("/monthly-comparison", response_model=List[MonthlyComparison])
def monthly_comparison(months: int = 6, db: Session = Depends(get_db), _=Depends(get_current_user)):
    return get_monthly_comparison(db, months)


@router.get("/profitability", response_model=List[ProductProfitability])
def product_profitability(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return get_product_profitability(db)


@router.get("/sales-by-product")
def sales_by_product(
    start_date: datetime = None,
    end_date: datetime = None,
    db: Session = Depends(get_db),
    _=Depends(get_current_user)
):
    q = db.query(
        Product.name,
        ProductVariant.name.label("variant_name"),
        func.sum(OrderItem.quantity).label("total_qty"),
        func.sum(OrderItem.subtotal).label("total_revenue"),
    ).join(ProductVariant, ProductVariant.id == OrderItem.variant_id
    ).join(Product, Product.id == ProductVariant.product_id
    ).join(Order, Order.id == OrderItem.order_id
    ).filter(Order.status != OrderStatus.cancelled)

    if start_date:
        q = q.filter(Order.created_at >= start_date)
    if end_date:
        q = q.filter(Order.created_at <= end_date)

    results = q.group_by(Product.name, ProductVariant.name).order_by(func.sum(OrderItem.quantity).desc()).all()
    return [{"product": r[0], "variant": r[1], "qty": int(r[2] or 0), "revenue": float(r[3] or 0)} for r in results]


@router.get("/sales-by-payment-method")
def sales_by_payment(
    start_date: datetime = None,
    end_date: datetime = None,
    db: Session = Depends(get_db),
    _=Depends(get_current_user)
):
    q = db.query(
        Payment.payment_method,
        func.count(Payment.id).label("count"),
        func.sum(Payment.amount).label("total"),
    ).join(Order, Order.id == Payment.order_id
    ).filter(Order.status != OrderStatus.cancelled)

    if start_date:
        q = q.filter(Order.created_at >= start_date)
    if end_date:
        q = q.filter(Order.created_at <= end_date)

    results = q.group_by(Payment.payment_method).all()
    return [{"method": r[0], "count": int(r[1]), "total": float(r[2] or 0)} for r in results]


@router.get("/daily-preview")
def daily_preview(
    day: Optional[date] = None,
    db: Session = Depends(get_db),
    _=Depends(get_current_user)
):
    """Live totals for a given day (not yet saved). Defaults to today (Colombia time)."""
    target = day or _now_colombia().date()
    preview = get_day_preview(db, target)
    # Append payment method breakdown for today
    start = datetime.combine(target, datetime.min.time())
    end = datetime.combine(target, datetime.max.time())
    payment_rows = db.query(
        Payment.payment_method,
        func.count(Payment.id).label("count"),
        func.sum(Payment.amount).label("total"),
    ).join(Order, Order.id == Payment.order_id).filter(
        Order.status != OrderStatus.cancelled,
        Order.created_at >= start,
        Order.created_at <= end,
    ).group_by(Payment.payment_method).all()
    preview["payment_breakdown"] = [
        {"method": str(r[0].value if hasattr(r[0], 'value') else r[0]), "count": int(r[1]), "total": float(r[2] or 0)}
        for r in payment_rows
    ]
    return preview


@router.post("/close-day", response_model=DailySummaryOut)
def close_day_endpoint(
    body: CloseDayRequest,
    day: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """Save the daily closing. Only allowed after 23:00 Colombia time."""
    now_col = _now_colombia()
    # Allow closing only after 23:00 (unless a specific day override is given)
    if day is None and now_col.hour < 23:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "CLOSE_TOO_EARLY",
                "message": f"No es posible cerrar antes de las 11:00 PM. Hora actual: {now_col.strftime('%H:%M')}",
            }
        )
    target = day or now_col.date()
    return close_day(db, target, current_user.id, body.notes)


@router.get("/daily-history", response_model=List[DailySummaryOut])
def daily_history(
    limit: int = 90,
    db: Session = Depends(get_db),
    _=Depends(get_current_user)
):
    """Return saved daily closings ordered newest first."""
    return get_daily_history(db, limit)


@router.get("/scheduler-status")
def scheduler_status(_=Depends(get_current_user)):
    """Estado del scheduler de cierre automático (Bloque 5)."""
    from app.services.scheduler import get_status
    return get_status()


# ─── EXPORTACIONES PDF / EXCEL ─────────────────────────────────────────────
from fastapi.responses import Response
from app.services.export_service import excel_from_table, pdf_from_table


def _date_range(start_date: Optional[datetime], end_date: Optional[datetime]):
    if not start_date:
        today = _now_colombia().date()
        start_date = datetime.combine(today.replace(day=1), datetime.min.time())
    if not end_date:
        end_date = datetime.utcnow()
    return start_date, end_date


def _daily_summary_payload(db: Session, day: Optional[date] = None) -> dict:
    target = day or _now_colombia().date()
    data = get_day_preview(db, target)
    return target, data


def _sales_by_product_payload(db: Session, start_date, end_date):
    q = db.query(
        Product.name, ProductVariant.name.label("vname"),
        func.sum(OrderItem.quantity), func.sum(OrderItem.subtotal),
    ).join(ProductVariant, ProductVariant.id == OrderItem.variant_id
    ).join(Product, Product.id == ProductVariant.product_id
    ).join(Order, Order.id == OrderItem.order_id
    ).filter(Order.status != OrderStatus.cancelled,
             Order.created_at >= start_date, Order.created_at <= end_date)
    return q.group_by(Product.name, ProductVariant.name).order_by(func.sum(OrderItem.subtotal).desc()).all()


def _sales_by_payment_payload(db: Session, start_date, end_date):
    return db.query(
        Payment.payment_method, func.count(Payment.id), func.sum(Payment.amount)
    ).join(Order, Order.id == Payment.order_id).filter(
        Order.status != OrderStatus.cancelled,
        Order.created_at >= start_date, Order.created_at <= end_date,
    ).group_by(Payment.payment_method).all()


@router.get("/export/daily/{fmt}")
def export_daily(
    fmt: str,
    day: Optional[date] = None,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """Exporta el cierre diario (preview o histórico) a pdf | xlsx."""
    fmt = fmt.lower()
    if fmt not in ("pdf", "xlsx"):
        raise HTTPException(400, "Formato inválido: usar 'pdf' o 'xlsx'")

    target, data = _daily_summary_payload(db, day)

    rows = []
    for it in (data.get("payment_breakdown") or []):
        rows.append([
            str(it.get("method") or "—"),
            int(it.get("count") or 0),
            float(it.get("total") or 0),
        ])

    summary = {
        "Ventas totales": float(data.get("total_sales") or 0),
        "Pedidos": int(data.get("total_orders") or 0),
        "Ticket promedio": float(data.get("avg_ticket") or 0),
        "COGS estimado": float(data.get("estimated_cogs") or 0),
        "Gastos": float(data.get("total_expenses") or 0),
        "Pérdidas": float(data.get("total_losses") or 0),
        "Utilidad neta": float(data.get("net_profit") or 0),
    }

    title = f"Cierre diario — {target.isoformat()}"
    columns = ["Método de pago", "Transacciones", "Total"]

    if fmt == "xlsx":
        content = excel_from_table(title, columns, rows, money_columns=[2], summary=summary)
        return Response(
            content=content,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="cierre_{target.isoformat()}.xlsx"'},
        )
    content = pdf_from_table(title, columns, rows, money_columns=[2], summary=summary,
                             subtitle="Resumen de operaciones del día")
    return Response(
        content=content, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="cierre_{target.isoformat()}.pdf"'},
    )


@router.get("/export/sales-by-product/{fmt}")
def export_sales_by_product(
    fmt: str,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    fmt = fmt.lower()
    if fmt not in ("pdf", "xlsx"):
        raise HTTPException(400, "Formato inválido")
    start_date, end_date = _date_range(start_date, end_date)
    raw = _sales_by_product_payload(db, start_date, end_date)
    rows = [[r[0], r[1], int(r[2] or 0), float(r[3] or 0)] for r in raw]

    total_qty = sum(r[2] for r in rows)
    total_rev = sum(r[3] for r in rows)
    summary = {"Unidades vendidas": total_qty, "Ingreso total": total_rev}

    title = "Ventas por producto"
    subtitle = f"Período: {start_date.strftime('%Y-%m-%d')} → {end_date.strftime('%Y-%m-%d')}"
    columns = ["Producto", "Variante", "Cantidad", "Ingreso"]

    if fmt == "xlsx":
        content = excel_from_table(title, columns, rows, money_columns=[3], summary=summary)
        return Response(content=content,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": 'attachment; filename="ventas_producto.xlsx"'})
    content = pdf_from_table(title, columns, rows, money_columns=[3], summary=summary, subtitle=subtitle)
    return Response(content=content, media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="ventas_producto.pdf"'})


@router.get("/export/sales-by-payment/{fmt}")
def export_sales_by_payment(
    fmt: str,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    fmt = fmt.lower()
    if fmt not in ("pdf", "xlsx"):
        raise HTTPException(400, "Formato inválido")
    start_date, end_date = _date_range(start_date, end_date)
    raw = _sales_by_payment_payload(db, start_date, end_date)
    rows = [[str(r[0].value if hasattr(r[0], 'value') else r[0]), int(r[1]), float(r[2] or 0)] for r in raw]
    total = sum(r[2] for r in rows)
    summary = {"Total recaudado": total}

    title = "Ventas por método de pago"
    subtitle = f"Período: {start_date.strftime('%Y-%m-%d')} → {end_date.strftime('%Y-%m-%d')}"
    columns = ["Método", "Transacciones", "Total"]

    if fmt == "xlsx":
        content = excel_from_table(title, columns, rows, money_columns=[2], summary=summary)
        return Response(content=content,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": 'attachment; filename="ventas_metodo_pago.xlsx"'})
    content = pdf_from_table(title, columns, rows, money_columns=[2], summary=summary, subtitle=subtitle)
    return Response(content=content, media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="ventas_metodo_pago.pdf"'})


@router.get("/export/financial/{fmt}")
def export_financial(
    fmt: str,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    fmt = fmt.lower()
    if fmt not in ("pdf", "xlsx"):
        raise HTTPException(400, "Formato inválido")
    start_date, end_date = _date_range(start_date, end_date)
    summary = get_financial_summary(db, start_date, end_date)
    # Compose as table of metrics
    def f(v):
        try: return float(v)
        except: return 0.0
    rows = [
        ["Ventas totales", f(summary.total_sales)],
        ["Pedidos", int(summary.total_orders)],
        ["Ticket promedio", f(summary.avg_ticket)],
        ["COGS estimado", f(summary.estimated_cogs)],
        ["Compras", f(summary.total_purchases)],
        ["Gastos", f(summary.total_expenses)],
        ["Pérdidas", f(summary.total_losses)],
        ["Utilidad bruta", f(summary.gross_profit)],
        ["Utilidad neta", f(summary.net_profit)],
        ["Margen bruto (%)", f(summary.gross_margin_pct)],
        ["Margen neto (%)", f(summary.net_margin_pct)],
    ]
    title = "Resumen financiero"
    subtitle = f"Período: {start_date.strftime('%Y-%m-%d')} → {end_date.strftime('%Y-%m-%d')}"
    columns = ["Concepto", "Valor"]

    if fmt == "xlsx":
        content = excel_from_table(title, columns, rows, money_columns=[1])
        return Response(content=content,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": 'attachment; filename="resumen_financiero.xlsx"'})
    content = pdf_from_table(title, columns, rows, money_columns=[1], subtitle=subtitle)
    return Response(content=content, media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="resumen_financiero.pdf"'})
