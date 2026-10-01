from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.db.session import get_db
from app.schemas.customer import CustomerCreate, CustomerUpdate, CustomerOut
from app.models.customer import Customer
from app.api.deps import get_current_user

router = APIRouter()


@router.get("/", response_model=List[CustomerOut])
def list_customers(search: str = "", db: Session = Depends(get_db), _=Depends(get_current_user)):
    q = db.query(Customer).filter(Customer.is_active == True)
    if search:
        q = q.filter(Customer.name.ilike(f"%{search}%") | Customer.phone.ilike(f"%{search}%"))
    return q.order_by(Customer.name).all()


@router.get("/{customer_id}", response_model=CustomerOut)
def get_customer(customer_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    c = db.query(Customer).filter(Customer.id == customer_id).first()
    if not c:
        raise HTTPException(404, "Customer not found")
    return c


@router.post("/", response_model=CustomerOut)
def create_customer(data: CustomerCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    c = Customer(**data.model_dump())
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@router.put("/{customer_id}", response_model=CustomerOut)
def update_customer(customer_id: int, data: CustomerUpdate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    c = db.query(Customer).filter(Customer.id == customer_id).first()
    if not c:
        raise HTTPException(404, "Customer not found")
    for f, v in data.model_dump(exclude_unset=True).items():
        setattr(c, f, v)
    db.commit()
    db.refresh(c)
    return c
