from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from decimal import Decimal
from app.models.financial import LossType


class StockLossCreate(BaseModel):
    inventory_item_id: int
    quantity: Decimal
    loss_type: LossType
    description: Optional[str] = None
    loss_date: Optional[datetime] = None


class StockLossOut(StockLossCreate):
    id: int
    unit_cost: Optional[Decimal] = None
    total_cost: Optional[Decimal] = None
    recorded_by_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


class DashboardMetrics(BaseModel):
    today_sales: Decimal
    today_orders: int
    month_sales: Decimal
    month_orders: int
    month_purchases: Decimal
    month_expenses: Decimal
    month_estimated_cogs: Decimal
    month_gross_profit: Decimal
    month_net_profit: Decimal
    month_gross_margin_pct: Decimal
    month_net_margin_pct: Decimal
    prev_month_sales: Decimal
    prev_month_net_profit: Decimal
    sales_growth_pct: Decimal
    profit_growth_pct: Decimal
    top_product: Optional[str] = None
    top_product_qty: int = 0
    low_stock_items: int = 0
    # Bloques 2 y 3
    today_courtesies: int = 0
    month_delivery_cost: Decimal = Decimal("0")


class MonthlyComparison(BaseModel):
    year: int
    month: int
    month_name: str
    total_sales: Decimal
    total_orders: int
    avg_ticket: Decimal
    estimated_cogs: Decimal
    total_purchases: Decimal
    total_expenses: Decimal
    gross_profit: Decimal
    net_profit: Decimal
    gross_margin_pct: Decimal
    net_margin_pct: Decimal


class ProductProfitability(BaseModel):
    product_id: int
    product_name: str
    variant_id: int
    variant_name: str
    price: Decimal
    estimated_cost: Decimal
    estimated_margin: Decimal
    margin_pct: Decimal
    units_sold: int
    total_revenue: Decimal
    total_profit: Decimal


class FinancialSummary(BaseModel):
    period_start: datetime
    period_end: datetime
    total_sales: Decimal
    total_orders: int
    avg_ticket: Decimal
    estimated_cogs: Decimal
    total_purchases: Decimal
    total_expenses: Decimal
    total_losses: Decimal
    gross_profit: Decimal
    net_profit: Decimal
    gross_margin_pct: Decimal
    net_margin_pct: Decimal
    cost_participation_pct: Decimal
    expense_participation_pct: Decimal
    is_profitable: bool
    analysis_text: List[str] = []
    # Bloques 2 y 3
    total_courtesies: int = 0
    total_delivery_cost: Decimal = Decimal("0")


class BusinessInsight(BaseModel):
    type: str  # "positive", "negative", "neutral"
    message: str
    metric: Optional[str] = None
    value: Optional[Decimal] = None


class DailySummaryOut(BaseModel):
    id: int
    summary_date: str
    total_sales: Decimal
    total_orders: int
    avg_ticket: Decimal
    estimated_cogs: Decimal
    total_purchases: Decimal
    total_expenses: Decimal
    total_losses: Decimal
    gross_profit: Decimal
    net_profit: Decimal
    gross_margin_pct: Decimal
    net_margin_pct: Decimal
    notes: Optional[str] = None
    payment_methods: Optional[dict] = None
    products_sold: Optional[list] = None
    closed_by_id: Optional[int] = None
    closed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class CloseDayRequest(BaseModel):
    notes: Optional[str] = None
