from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime
from app.db.session import get_db
from app.schemas.expense import ExpenseCategoryCreate, ExpenseCategoryOut, ExpenseCreate, ExpenseUpdate, ExpenseOut
from app.models.expense import ExpenseCategory, Expense
from app.api.deps import get_current_user, get_admin

router = APIRouter()


@router.get("/categories", response_model=List[ExpenseCategoryOut])
def list_categories(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(ExpenseCategory).filter(ExpenseCategory.is_active == True).all()


@router.post("/categories", response_model=ExpenseCategoryOut)
def create_category(data: ExpenseCategoryCreate, db: Session = Depends(get_db), _=Depends(get_admin)):
    cat = ExpenseCategory(**data.model_dump())
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@router.get("/", response_model=List[ExpenseOut])
def list_expenses(
    start_date: datetime = None,
    end_date: datetime = None,
    category_id: int = None,
    db: Session = Depends(get_db),
    _=Depends(get_current_user)
):
    q = db.query(Expense)
    if start_date:
        q = q.filter(Expense.expense_date >= start_date)
    if end_date:
        q = q.filter(Expense.expense_date <= end_date)
    if category_id:
        q = q.filter(Expense.category_id == category_id)
    return q.order_by(Expense.expense_date.desc()).all()


@router.post("/", response_model=ExpenseOut)
def create_expense(data: ExpenseCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    exp = Expense(
        category_id=data.category_id,
        description=data.description,
        amount=data.amount,
        payment_method=data.payment_method,
        expense_date=data.expense_date or datetime.utcnow(),
        notes=data.notes,
        created_by_id=current_user.id,
    )
    db.add(exp)
    db.commit()
    db.refresh(exp)
    return exp


@router.put("/{expense_id}", response_model=ExpenseOut)
def update_expense(expense_id: int, data: ExpenseUpdate, db: Session = Depends(get_db), _=Depends(get_admin)):
    exp = db.query(Expense).filter(Expense.id == expense_id).first()
    if not exp:
        raise HTTPException(404, "Expense not found")
    for f, v in data.model_dump(exclude_unset=True).items():
        setattr(exp, f, v)
    db.commit()
    db.refresh(exp)
    return exp


@router.delete("/{expense_id}")
def delete_expense(expense_id: int, db: Session = Depends(get_db), _=Depends(get_admin)):
    exp = db.query(Expense).filter(Expense.id == expense_id).first()
    if not exp:
        raise HTTPException(404, "Expense not found")
    db.delete(exp)
    db.commit()
    return {"ok": True}
