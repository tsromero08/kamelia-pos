from app.db.base_class import Base  # noqa

# Import all models so Alembic detects them
from app.models.user import User, Role  # noqa
from app.models.product import Product, ProductVariant, ProductOptionGroup, ProductOption, ProductImage, Category  # noqa
from app.models.inventory import InventoryItem, InventoryMovement, InventoryCostHistory, UnitOfMeasure, Supplier, InventoryBatch  # noqa
from app.models.recipe import Recipe, RecipeItem, RecipeOptionOverride, ComboComponent  # noqa
from app.models.order import Order, OrderItem, OrderItemModifier, OrderItemOption, Payment, OrderStatusHistory  # noqa
from app.models.customer import Customer  # noqa
from app.models.purchase import Purchase, PurchaseItem  # noqa
from app.models.expense import Expense, ExpenseCategory  # noqa
from app.models.financial import StockLoss, MonthlySummary, DailySummary  # noqa
from app.models.audit import AuditLog  # noqa
from app.models.cash_session import CashSession  # noqa
