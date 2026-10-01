from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from decimal import Decimal
from datetime import datetime, date, timezone, timedelta
from typing import List, Optional

# Zona horaria Colombia (UTC-5). Los timestamps en BD son UTC naive.
COLOMBIA_TZ = timezone(timedelta(hours=-5))


def _today_colombia() -> date:
    """Fecha 'hoy' según hora Colombia (no UTC)."""
    return datetime.now(COLOMBIA_TZ).date()


def _colombia_day_range(d: date) -> tuple:
    """
    Convierte un día Colombia a su rango UTC equivalente para consultar la BD.
    BD guarda created_at como UTC naive (datetime.utcnow()).
    """
    start_col = datetime.combine(d, datetime.min.time(), tzinfo=COLOMBIA_TZ)
    end_col = datetime.combine(d, datetime.max.time(), tzinfo=COLOMBIA_TZ)
    # Pasar a UTC y quitar tzinfo (matchear BD naive)
    start_utc = start_col.astimezone(timezone.utc).replace(tzinfo=None)
    end_utc = end_col.astimezone(timezone.utc).replace(tzinfo=None)
    return start_utc, end_utc
from app.models.order import Order, OrderItem, OrderStatus, Payment
from app.models.expense import Expense
from app.models.purchase import Purchase
from app.models.financial import StockLoss, MonthlySummary, DailySummary
from app.models.inventory import InventoryItem
from app.models.product import ProductVariant, Product
from app.schemas.financial import (
    FinancialSummary, DashboardMetrics, MonthlyComparison,
    ProductProfitability, BusinessInsight, DailySummaryOut
)
from app.services.inventory_service import calculate_recipe_cost


def get_period_sales(db: Session, start: datetime, end: datetime) -> Decimal:
    result = db.query(func.sum(Order.total)).filter(
        Order.status != OrderStatus.cancelled,
        Order.created_at >= start,
        Order.created_at <= end,
    ).scalar()
    return Decimal(str(result or 0))


def get_period_orders_count(db: Session, start: datetime, end: datetime) -> int:
    return db.query(Order).filter(
        Order.status != OrderStatus.cancelled,
        Order.created_at >= start,
        Order.created_at <= end,
    ).count()


def get_period_expenses(db: Session, start: datetime, end: datetime) -> Decimal:
    result = db.query(func.sum(Expense.amount)).filter(
        Expense.expense_date >= start,
        Expense.expense_date <= end,
    ).scalar()
    return Decimal(str(result or 0))


def get_period_purchases(db: Session, start: datetime, end: datetime) -> Decimal:
    result = db.query(func.sum(Purchase.total)).filter(
        Purchase.purchase_date >= start,
        Purchase.purchase_date <= end,
    ).scalar()
    return Decimal(str(result or 0))


def get_period_losses(db: Session, start: datetime, end: datetime) -> Decimal:
    result = db.query(func.sum(StockLoss.total_cost)).filter(
        StockLoss.loss_date >= start,
        StockLoss.loss_date <= end,
    ).scalar()
    return Decimal(str(result or 0))


def estimate_cogs(db: Session, start: datetime, end: datetime) -> Decimal:
    """Estimate Cost of Goods Sold for a period based on recipes."""
    orders = db.query(Order).filter(
        Order.status != OrderStatus.cancelled,
        Order.created_at >= start,
        Order.created_at <= end,
    ).all()

    total_cogs = Decimal("0")
    for order in orders:
        for item in order.items:
            cost = calculate_recipe_cost(db, item.variant_id)
            total_cogs += cost * item.quantity
    return total_cogs


def get_financial_summary(db: Session, start: datetime, end: datetime) -> FinancialSummary:
    sales = get_period_sales(db, start, end)
    orders_count = get_period_orders_count(db, start, end)
    expenses = get_period_expenses(db, start, end)
    purchases = get_period_purchases(db, start, end)
    losses = get_period_losses(db, start, end)
    cogs = estimate_cogs(db, start, end)

    gross_profit = sales - cogs
    net_profit = sales - cogs - expenses

    gross_margin = (gross_profit / sales * 100) if sales > 0 else Decimal("0")
    net_margin = (net_profit / sales * 100) if sales > 0 else Decimal("0")
    cost_part = (cogs / sales * 100) if sales > 0 else Decimal("0")
    expense_part = (expenses / sales * 100) if sales > 0 else Decimal("0")
    avg_ticket = (sales / orders_count) if orders_count > 0 else Decimal("0")

    analysis = _generate_analysis_text(sales, cogs, expenses, gross_profit, net_profit, gross_margin, net_margin)

    # Bloque 2: cortesías del período
    courtesies_count = db.query(Order).filter(
        Order.is_courtesy == True,
        Order.status != OrderStatus.cancelled,
        Order.created_at >= start,
        Order.created_at <= end,
    ).count()

    # Bloque 3: gasto de domicilios del período
    from app.models.expense import Expense, ExpenseCategory
    delivery_cat = db.query(ExpenseCategory).filter(
        ExpenseCategory.name == "Domicilios"
    ).first()
    delivery_total = Decimal("0")
    if delivery_cat:
        delivery_sum = db.query(func.sum(Expense.amount)).filter(
            Expense.category_id == delivery_cat.id,
            Expense.expense_date >= start,
            Expense.expense_date <= end,
        ).scalar()
        delivery_total = Decimal(str(delivery_sum or 0))

    return FinancialSummary(
        period_start=start,
        period_end=end,
        total_sales=sales,
        total_orders=orders_count,
        avg_ticket=round(avg_ticket, 2),
        estimated_cogs=cogs,
        total_purchases=purchases,
        total_expenses=expenses,
        total_losses=losses,
        gross_profit=gross_profit,
        net_profit=net_profit,
        gross_margin_pct=round(gross_margin, 2),
        net_margin_pct=round(net_margin, 2),
        cost_participation_pct=round(cost_part, 2),
        expense_participation_pct=round(expense_part, 2),
        is_profitable=net_profit > 0,
        analysis_text=analysis,
        total_courtesies=courtesies_count,
        total_delivery_cost=delivery_total,
    )


def _generate_analysis_text(sales, cogs, expenses, gross_profit, net_profit, gross_margin, net_margin) -> List[str]:
    insights = []
    if net_profit > 0:
        insights.append(f"Estás operando con utilidad estimada de ${net_profit:,.0f}")
    else:
        insights.append(f"Estás operando con pérdida estimada de ${abs(net_profit):,.0f}")

    if gross_margin > 0:
        insights.append(f"Tu margen bruto estimado es del {gross_margin:.1f}%")

    if sales > 0:
        cost_pct = cogs / sales * 100
        if cost_pct > 60:
            insights.append(f"Tus costos representan el {cost_pct:.1f}% de tus ventas — revisa precios o recetas")
        else:
            insights.append(f"Tus costos representan el {cost_pct:.1f}% de tus ventas")

        exp_pct = expenses / sales * 100
        insights.append(f"Tus gastos operativos representan el {exp_pct:.1f}% de tus ventas")

    return insights


def get_dashboard_metrics(db: Session) -> DashboardMetrics:
    # "Hoy" en hora Colombia (UTC-5), no UTC
    today = _today_colombia()
    today_start, today_end = _colombia_day_range(today)

    # "Este mes" también en hora Colombia
    month_start = today.replace(day=1)
    month_start_dt, _ = _colombia_day_range(month_start)
    month_end_dt = today_end

    if month_start.month == 1:
        prev_month_start = month_start.replace(year=month_start.year - 1, month=12, day=1)
    else:
        prev_month_start = month_start.replace(month=month_start.month - 1)
    prev_month_start_dt, _ = _colombia_day_range(prev_month_start)
    prev_month_end = month_start_dt

    today_sales = get_period_sales(db, today_start, today_end)
    today_orders = get_period_orders_count(db, today_start, today_end)
    month_sales = get_period_sales(db, month_start_dt, month_end_dt)
    month_orders = get_period_orders_count(db, month_start_dt, month_end_dt)
    month_purchases = get_period_purchases(db, month_start_dt, month_end_dt)
    month_expenses = get_period_expenses(db, month_start_dt, month_end_dt)
    month_cogs = estimate_cogs(db, month_start_dt, month_end_dt)

    month_gross = month_sales - month_cogs
    month_net = month_sales - month_cogs - month_expenses
    month_gross_margin = (month_gross / month_sales * 100) if month_sales > 0 else Decimal("0")
    month_net_margin = (month_net / month_sales * 100) if month_sales > 0 else Decimal("0")

    prev_sales = get_period_sales(db, prev_month_start_dt, prev_month_end)
    prev_cogs = estimate_cogs(db, prev_month_start_dt, prev_month_end)
    prev_expenses = get_period_expenses(db, prev_month_start_dt, prev_month_end)
    prev_net = prev_sales - prev_cogs - prev_expenses

    sales_growth = ((month_sales - prev_sales) / prev_sales * 100) if prev_sales > 0 else Decimal("0")
    profit_growth = ((month_net - prev_net) / abs(prev_net) * 100) if prev_net != 0 else Decimal("0")

    # Top product this month
    top = db.query(
        Product.name, func.sum(OrderItem.quantity).label("qty")
    ).join(ProductVariant, ProductVariant.id == OrderItem.variant_id
    ).join(Product, Product.id == ProductVariant.product_id
    ).join(Order, Order.id == OrderItem.order_id
    ).filter(
        Order.status != OrderStatus.cancelled,
        Order.created_at >= month_start_dt,
        Order.created_at <= month_end_dt,
    ).group_by(Product.name).order_by(func.sum(OrderItem.quantity).desc()).first()

    low_stock_count = db.query(InventoryItem).filter(
        InventoryItem.is_active == True,
        InventoryItem.current_stock <= InventoryItem.minimum_stock,
    ).count()

    # Bloque 2: cortesías del día
    today_courtesies = db.query(Order).filter(
        Order.is_courtesy == True,
        Order.status != OrderStatus.cancelled,
        Order.created_at >= today_start,
        Order.created_at <= today_end,
    ).count()

    # Bloque 3: gastos de domicilio del mes (auto-generados)
    from app.models.expense import Expense, ExpenseCategory
    delivery_cat = db.query(ExpenseCategory).filter(ExpenseCategory.name == "Domicilios").first()
    month_delivery_cost = Decimal("0")
    if delivery_cat:
        delivery_sum = db.query(func.sum(Expense.amount)).filter(
            Expense.category_id == delivery_cat.id,
            Expense.expense_date >= month_start_dt,
            Expense.expense_date <= month_end_dt,
        ).scalar()
        month_delivery_cost = Decimal(str(delivery_sum or 0))

    return DashboardMetrics(
        today_sales=today_sales,
        today_orders=today_orders,
        month_sales=month_sales,
        month_orders=month_orders,
        month_purchases=month_purchases,
        month_expenses=month_expenses,
        month_estimated_cogs=month_cogs,
        month_gross_profit=month_gross,
        month_net_profit=month_net,
        month_gross_margin_pct=round(month_gross_margin, 2),
        month_net_margin_pct=round(month_net_margin, 2),
        prev_month_sales=prev_sales,
        prev_month_net_profit=prev_net,
        sales_growth_pct=round(sales_growth, 2),
        profit_growth_pct=round(profit_growth, 2),
        top_product=top[0] if top else None,
        top_product_qty=int(top[1]) if top else 0,
        low_stock_items=low_stock_count,
        today_courtesies=today_courtesies,
        month_delivery_cost=month_delivery_cost,
    )


def get_monthly_comparison(db: Session, months: int = 6) -> List[MonthlyComparison]:
    today = _today_colombia()
    results = []
    month_names = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]

    for i in range(months - 1, -1, -1):
        m = today.month - i
        y = today.year
        while m <= 0:
            m += 12
            y -= 1
        # Inicio del mes en Colombia → UTC
        m_start, _ = _colombia_day_range(date(y, m, 1))
        if m == 12:
            m_end, _ = _colombia_day_range(date(y + 1, 1, 1))
        else:
            m_end, _ = _colombia_day_range(date(y, m + 1, 1))

        sales = get_period_sales(db, m_start, m_end)
        orders = get_period_orders_count(db, m_start, m_end)
        expenses = get_period_expenses(db, m_start, m_end)
        purchases = get_period_purchases(db, m_start, m_end)
        cogs = estimate_cogs(db, m_start, m_end)
        gross = sales - cogs
        net = sales - cogs - expenses
        avg_ticket = (sales / orders) if orders > 0 else Decimal("0")
        gross_margin = (gross / sales * 100) if sales > 0 else Decimal("0")
        net_margin = (net / sales * 100) if sales > 0 else Decimal("0")

        results.append(MonthlyComparison(
            year=y,
            month=m,
            month_name=f"{month_names[m - 1]} {y}",
            total_sales=sales,
            total_orders=orders,
            avg_ticket=round(avg_ticket, 2),
            estimated_cogs=cogs,
            total_purchases=purchases,
            total_expenses=expenses,
            gross_profit=gross,
            net_profit=net,
            gross_margin_pct=round(gross_margin, 2),
            net_margin_pct=round(net_margin, 2),
        ))
    return results


def get_product_profitability(db: Session) -> List[ProductProfitability]:
    variants = db.query(ProductVariant).filter(ProductVariant.is_active == True).all()
    results = []
    for variant in variants:
        cost = calculate_recipe_cost(db, variant.id)
        margin = variant.price - cost
        margin_pct = (margin / variant.price * 100) if variant.price > 0 else Decimal("0")

        units_sold = db.query(func.sum(OrderItem.quantity)).join(
            Order, Order.id == OrderItem.order_id
        ).filter(
            OrderItem.variant_id == variant.id,
            Order.status != OrderStatus.cancelled,
        ).scalar() or 0

        total_revenue = variant.price * units_sold
        total_profit = margin * units_sold

        results.append(ProductProfitability(
            product_id=variant.product_id,
            product_name=variant.product.name,
            variant_id=variant.id,
            variant_name=f"{variant.product.name} - {variant.name}",
            price=variant.price,
            estimated_cost=cost,
            estimated_margin=margin,
            margin_pct=round(margin_pct, 2),
            units_sold=int(units_sold),
            total_revenue=total_revenue,
            total_profit=total_profit,
        ))

    return sorted(results, key=lambda x: x.total_profit, reverse=True)


def get_payment_methods_breakdown(db: Session, start: datetime, end: datetime) -> dict:
    """Suma por método de pago en el periodo."""
    rows = (
        db.query(Payment.payment_method, func.sum(Payment.amount))
        .join(Order, Order.id == Payment.order_id)
        .filter(
            Order.status != OrderStatus.cancelled,
            Order.created_at >= start,
            Order.created_at <= end,
        )
        .group_by(Payment.payment_method)
        .all()
    )
    out = {}
    for method, amount in rows:
        # method puede ser enum, string, o tener prefijo "PaymentMethod."
        key = method.value if hasattr(method, "value") else str(method)
        if "." in key:
            key = key.split(".")[-1]
        out[key] = float(amount or 0)
    return out


def get_products_sold_breakdown(db: Session, start: datetime, end: datetime) -> list:
    """Productos vendidos (cantidad y total) en el periodo."""
    rows = (
        db.query(
            Product.name,
            ProductVariant.name.label("variant_name"),
            func.sum(OrderItem.quantity).label("qty"),
            func.sum(OrderItem.subtotal).label("total"),
        )
        .join(ProductVariant, ProductVariant.id == OrderItem.variant_id)
        .join(Product, Product.id == ProductVariant.product_id)
        .join(Order, Order.id == OrderItem.order_id)
        .filter(
            Order.status != OrderStatus.cancelled,
            Order.created_at >= start,
            Order.created_at <= end,
        )
        .group_by(Product.name, ProductVariant.name)
        .order_by(func.sum(OrderItem.subtotal).desc())
        .all()
    )
    return [
        {
            "name": name if variant_name in (None, "Única", "Sola") else f"{name} ({variant_name})",
            "qty": int(qty or 0),
            "total": float(total or 0),
        }
        for name, variant_name, qty, total in rows
    ]


def get_day_preview(db: Session, day: date) -> dict:
    """
    Calculate live numbers for a given day (Colombia time, not UTC).
    BD almacena timestamps UTC naive, así que convertimos el día a rango UTC.
    """
    start, end = _colombia_day_range(day)
    sales = get_period_sales(db, start, end)
    orders = get_period_orders_count(db, start, end)
    expenses = get_period_expenses(db, start, end)
    purchases = get_period_purchases(db, start, end)
    losses = get_period_losses(db, start, end)
    cogs = estimate_cogs(db, start, end)
    gross = sales - cogs
    net = sales - cogs - expenses
    avg_ticket = (sales / orders) if orders > 0 else Decimal("0")
    gross_margin = (gross / sales * 100) if sales > 0 else Decimal("0")
    net_margin = (net / sales * 100) if sales > 0 else Decimal("0")
    return {
        "summary_date": str(day),
        "total_sales": sales,
        "total_orders": orders,
        "avg_ticket": round(avg_ticket, 2),
        "estimated_cogs": cogs,
        "total_purchases": purchases,
        "total_expenses": expenses,
        "total_losses": losses,
        "gross_profit": gross,
        "net_profit": net,
        "gross_margin_pct": round(gross_margin, 2),
        "net_margin_pct": round(net_margin, 2),
        "payment_methods": get_payment_methods_breakdown(db, start, end),
        "products_sold": get_products_sold_breakdown(db, start, end),
    }


def close_day(db: Session, day: date, user_id: Optional[int] = None, notes: str = None) -> DailySummary:
    """Save or overwrite the daily summary for the given date."""
    data = get_day_preview(db, day)
    # Sanitize: remove keys not in DailySummary if any, and split json fields
    payment_methods = data.pop("payment_methods", {})
    products_sold = data.pop("products_sold", [])

    existing = db.query(DailySummary).filter(DailySummary.summary_date == str(day)).first()
    if existing:
        for k, v in data.items():
            setattr(existing, k, v)
        existing.payment_methods = payment_methods
        existing.products_sold = products_sold
        existing.notes = notes
        existing.closed_by_id = user_id
        existing.closed_at = datetime.utcnow()
        db.commit()
        db.refresh(existing)
        return existing
    record = DailySummary(
        **data,
        payment_methods=payment_methods,
        products_sold=products_sold,
        notes=notes,
        closed_by_id=user_id,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def get_daily_history(db: Session, limit: int = 90) -> list:
    return (
        db.query(DailySummary)
        .order_by(DailySummary.summary_date.desc())
        .limit(limit)
        .all()
    )
