from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from decimal import Decimal
from app.models.expense import ExpensePaymentMethod


class ExpenseCategoryBase(BaseModel):
    name: str
    description: Optional[str] = None
    is_active: bool = True


class ExpenseCategoryCreate(ExpenseCategoryBase):
    pass


class ExpenseCategoryOut(ExpenseCategoryBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class ExpenseBase(BaseModel):
    category_id: int
    description: str
    amount: Decimal
    payment_method: ExpensePaymentMethod = ExpensePaymentMethod.cash
    expense_date: Optional[datetime] = None
    notes: Optional[str] = None


class ExpenseCreate(ExpenseBase):
    pass


class ExpenseUpdate(BaseModel):
    category_id: Optional[int] = None
    description: Optional[str] = None
    amount: Optional[Decimal] = None
    payment_method: Optional[ExpensePaymentMethod] = None
    expense_date: Optional[datetime] = None
    notes: Optional[str] = None


class ExpenseOut(ExpenseBase):
    id: int
    created_by_id: Optional[int] = None
    created_at: datetime
    category: Optional[ExpenseCategoryOut] = None

    class Config:
        from_attributes = True
