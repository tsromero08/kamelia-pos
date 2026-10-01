from fastapi import APIRouter
from app.api.v1.endpoints import (
    auth, users, products, inventory, recipes, orders, customers,
    purchases, expenses, reports, losses, notifications, system,
    cash_sessions, audit_logs, kitchen, dispatch,
)

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(products.router, prefix="/products", tags=["products"])
api_router.include_router(inventory.router, prefix="/inventory", tags=["inventory"])
api_router.include_router(recipes.router, prefix="/recipes", tags=["recipes"])
api_router.include_router(orders.router, prefix="/orders", tags=["orders"])
api_router.include_router(customers.router, prefix="/customers", tags=["customers"])
api_router.include_router(purchases.router, prefix="/purchases", tags=["purchases"])
api_router.include_router(expenses.router, prefix="/expenses", tags=["expenses"])
api_router.include_router(reports.router, prefix="/reports", tags=["reports"])
api_router.include_router(losses.router, prefix="/losses", tags=["losses"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
api_router.include_router(system.router, prefix="/system", tags=["system"])
api_router.include_router(cash_sessions.router, prefix="/cash-sessions", tags=["cash-sessions"])
api_router.include_router(audit_logs.router, prefix="/audit-logs", tags=["audit-logs"])
api_router.include_router(kitchen.router, prefix="/kitchen", tags=["kitchen"])
api_router.include_router(dispatch.router, prefix="/dispatch", tags=["dispatch"])
