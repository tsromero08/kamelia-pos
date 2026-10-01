"""
Seed mínimo del sistema. Crea:
  - 4 roles (Administrador, Cajero, Cocina, Mesero)
  - 4 usuarios default (admin/cajero/cocina/mesero) con dominio del restaurant.config.json
  - Unidades de medida genéricas (g, un, ml, L, por)
  - Un proveedor genérico
  - Categorías de gastos generales (no específicas de un rubro)

NO crea productos, inventario ni recetas — eso lo carga el dueño desde el
panel de administración (Productos / Inventario / Recetas), o ejecuta:
    python -m app.db.seed_products  # plantilla CSV opcional

Para correrlo manualmente:
    python -m app.db.seed
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.db.session import SessionLocal
from app.db.base import Base
from app.db.session import engine
from app.core.security import get_password_hash
from app.core import branding
from app.models.user import User, Role
from app.models.inventory import UnitOfMeasure, Supplier
from app.models.expense import ExpenseCategory


# ─── Configuración por defecto ─────────────────────────────────────────
DEFAULT_USERS = [
    # (role_name, display_name, email_prefix, password)
    ("Administrador", "Administrador", "admin",   branding.first_admin_password()),
    ("Cajero",        "Cajero",        "cajero",  "CambiaEstaClave123"),
    ("Cocina",        "Cocina",        "cocina",  "CambiaEstaClave123"),
    ("Mesero",        "Mesero",        "mesero",  "CambiaEstaClave123"),
]

ROLES = [
    ("Administrador", "Acceso total al sistema"),
    ("Cajero",        "Ventas y caja"),
    ("Cocina",        "Pantalla de cocina"),
    ("Mesero",        "Toma de pedidos en mesa"),
]

UNITS = [
    ("Gramos", "g"),
    ("Unidades", "un"),
    ("Mililitros", "ml"),
    ("Litros", "L"),
    ("Porciones", "por"),
    ("Kilogramos", "kg"),
]

EXPENSE_CATEGORIES = [
    "Arriendo",
    "Servicios públicos",
    "Nómina",
    "Transporte",
    "Empaques",
    "Publicidad",
    "Mantenimiento",
    "Plataformas digitales",
    "Gas",
    "Internet",
    "Otros",
]


def seed() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    email_domain = branding.email_domain()

    try:
        # ── Roles ────────────────────────────────────────────────────
        roles = {}
        for name, desc in ROLES:
            r = db.query(Role).filter(Role.name == name).first()
            if not r:
                r = Role(name=name, description=desc)
                db.add(r)
                db.flush()
            roles[name] = r

        # ── Usuarios default ──────────────────────────────────────────
        for role_name, display, prefix, password in DEFAULT_USERS:
            email = f"{prefix}@{email_domain}"
            if not db.query(User).filter(User.email == email).first():
                db.add(User(
                    name=display,
                    email=email,
                    hashed_password=get_password_hash(password),
                    role_id=roles[role_name].id,
                ))
        db.flush()

        # ── Unidades de medida ────────────────────────────────────────
        for name, abbr in UNITS:
            if not db.query(UnitOfMeasure).filter(UnitOfMeasure.name == name).first():
                db.add(UnitOfMeasure(name=name, abbreviation=abbr))

        # ── Proveedor inicial ─────────────────────────────────────────
        if not db.query(Supplier).filter(Supplier.name == "Proveedor Principal").first():
            db.add(Supplier(
                name="Proveedor Principal",
                contact_name="(editar desde el panel)",
                phone="",
            ))

        # ── Categorías de gastos ──────────────────────────────────────
        for cat_name in EXPENSE_CATEGORIES:
            if not db.query(ExpenseCategory).filter(ExpenseCategory.name == cat_name).first():
                db.add(ExpenseCategory(name=cat_name))

        db.commit()

        print("Seed completado ✓")
        print(f"   Restaurante : {branding.business_name()}")
        print(f"   Dominio     : {email_domain}")
        print(f"   Admin       : admin@{email_domain}  /  {branding.first_admin_password()}")
        print(f"   Cajero      : cajero@{email_domain}  /  CambiaEstaClave123")
        print(f"   Cocina      : cocina@{email_domain}  /  CambiaEstaClave123")
        print(f"   Mesero      : mesero@{email_domain}  /  CambiaEstaClave123")
        print("")
        print("   Productos e inventario: cargar desde el panel admin")
        print("   (Productos → Nuevo) o ejecutar 'python -m app.db.seed_products'")

    except Exception as e:
        db.rollback()
        print(f"ERROR en seed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
