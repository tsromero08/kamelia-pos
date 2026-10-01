"""
Cargador masivo de productos e inventario desde CSV.

Edita las plantillas en `backend/data/` y luego ejecuta:
    python -m app.db.seed_products

Archivos esperados:
  data/inventario.csv   columns: nombre,unidad,stock,min_stock,costo
  data/productos.csv    columns: categoria,producto,variante,precio,tipo,combo,imagen

El script es idempotente: si un producto/insumo ya existe (por nombre) lo omite.

Para cargar también recetas (insumos por variante), usa:
  data/recetas.csv      columns: producto,variante,insumo,cantidad

Si los CSV no existen, el script termina sin error.
"""
from __future__ import annotations
import csv
import sys
import os
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.db.session import SessionLocal, engine
from app.db.base import Base
from app.models.product import Category, Product, ProductVariant, ProductType
from app.models.inventory import UnitOfMeasure, InventoryItem, InventoryMovement, MovementType, Supplier
from app.models.recipe import Recipe, RecipeItem


DATA_DIR = Path(__file__).resolve().parents[2] / "data"


def _load_csv(path: Path) -> list[dict]:
    if not path.exists():
        print(f"  - {path.name}: no existe (omitido)")
        return []
    with path.open("r", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _resolve_product_type(raw: str) -> ProductType:
    raw = (raw or "").strip().lower()
    for member in ProductType:
        if member.value == raw or member.name == raw:
            return member
    return next(iter(ProductType))  # default: el primero del enum


def seed_products() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        # ── 1. Inventario ─────────────────────────────────────────────
        inv_rows = _load_csv(DATA_DIR / "inventario.csv")
        supplier = db.query(Supplier).first()  # generado por seed.py
        items: dict[str, InventoryItem] = {}
        for row in inv_rows:
            name = row["nombre"].strip()
            unit = db.query(UnitOfMeasure).filter(UnitOfMeasure.name == row["unidad"].strip()).first()
            if not unit:
                print(f"  ! unidad '{row['unidad']}' no existe — saltando '{name}'")
                continue
            existing = db.query(InventoryItem).filter(InventoryItem.name == name).first()
            if existing:
                items[name] = existing
                continue
            stock = Decimal(row["stock"])
            cost = Decimal(row["costo"])
            item = InventoryItem(
                name=name,
                unit_id=unit.id,
                current_stock=stock,
                minimum_stock=Decimal(row["min_stock"]),
                current_cost=cost,
                preferred_supplier_id=supplier.id if supplier else None,
            )
            db.add(item)
            db.flush()
            db.add(InventoryMovement(
                item_id=item.id,
                movement_type=MovementType.initial,
                quantity=stock,
                quantity_before=Decimal("0"),
                quantity_after=stock,
                unit_cost=cost,
                notes="Carga inicial desde CSV",
            ))
            items[name] = item

        # ── 2. Categorías + Productos + Variantes ─────────────────────
        prod_rows = _load_csv(DATA_DIR / "productos.csv")
        # agrupar por (categoria, producto) → lista de variantes
        grouped: dict[tuple[str, str], list[dict]] = {}
        for row in prod_rows:
            key = (row["categoria"].strip(), row["producto"].strip())
            grouped.setdefault(key, []).append(row)

        cat_cache: dict[str, Category] = {}
        product_cache: dict[str, Product] = {}
        variant_cache: dict[tuple[str, str], ProductVariant] = {}

        for sort_idx, ((cat_name, prod_name), variants) in enumerate(grouped.items()):
            cat = cat_cache.get(cat_name) or db.query(Category).filter(Category.name == cat_name).first()
            if not cat:
                cat = Category(name=cat_name, description="", sort_order=sort_idx)
                db.add(cat); db.flush()
            cat_cache[cat_name] = cat

            prod = product_cache.get(prod_name) or db.query(Product).filter(Product.name == prod_name).first()
            if not prod:
                first = variants[0]
                prod = Product(
                    name=prod_name,
                    category_id=cat.id,
                    product_type=_resolve_product_type(first.get("tipo", "")),
                    image_url=(first.get("imagen") or "").strip() or None,
                    has_combo=any((v.get("combo") or "").lower() in ("1", "true", "si", "sí") for v in variants),
                )
                db.add(prod); db.flush()
            product_cache[prod_name] = prod

            for i, vrow in enumerate(variants):
                vname = (vrow.get("variante") or "Única").strip()
                if db.query(ProductVariant).filter(
                    ProductVariant.product_id == prod.id,
                    ProductVariant.name == vname,
                ).first():
                    continue
                is_combo = (vrow.get("combo") or "").lower() in ("1", "true", "si", "sí")
                variant = ProductVariant(
                    product_id=prod.id,
                    name=vname,
                    price=Decimal(vrow["precio"]),
                    is_combo=is_combo,
                    sort_order=i,
                )
                db.add(variant); db.flush()
                variant_cache[(prod_name, vname)] = variant

        # ── 3. Recetas (insumos por variante) ────────────────────────
        recipe_rows = _load_csv(DATA_DIR / "recetas.csv")
        for row in recipe_rows:
            prod_name = row["producto"].strip()
            vname = row["variante"].strip()
            inv_name = row["insumo"].strip()
            qty = Decimal(row["cantidad"])
            variant = variant_cache.get((prod_name, vname)) or \
                db.query(ProductVariant).join(Product).filter(
                    Product.name == prod_name,
                    ProductVariant.name == vname,
                ).first()
            inv = items.get(inv_name) or db.query(InventoryItem).filter(InventoryItem.name == inv_name).first()
            if not variant or not inv:
                print(f"  ! receta: variante o insumo no encontrado ({prod_name}/{vname} ← {inv_name})")
                continue
            recipe = db.query(Recipe).filter(Recipe.variant_id == variant.id).first()
            if not recipe:
                recipe = Recipe(variant_id=variant.id)
                db.add(recipe); db.flush()
            existing_ri = db.query(RecipeItem).filter(
                RecipeItem.recipe_id == recipe.id,
                RecipeItem.inventory_item_id == inv.id,
            ).first()
            if not existing_ri:
                db.add(RecipeItem(recipe_id=recipe.id, inventory_item_id=inv.id, quantity=qty))

        db.commit()
        print("\nCarga de productos ✓")
        print(f"  inventario : {len(items)} insumos")
        print(f"  productos  : {len(product_cache)}")
        print(f"  variantes  : {len(variant_cache)}")
        print(f"  recetas    : {len(recipe_rows)} líneas")
    except Exception as e:
        db.rollback()
        print(f"ERROR en seed_products: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_products()
