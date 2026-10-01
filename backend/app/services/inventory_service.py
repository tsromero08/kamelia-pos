from sqlalchemy.orm import Session
from decimal import Decimal
from datetime import datetime
from typing import Optional
from app.models.inventory import InventoryItem, InventoryMovement, MovementType, InventoryBatch
from app.models.order import Order, OrderItem, OrderItemModifier
from app.models.recipe import Recipe, RecipeItem, RecipeOptionOverride, ComboComponent
from app.models.product import ProductVariant


# ─── Lotes FEFO (First Expiring First Out) ─────────────────────────────────

def _consume_batches_fefo(db: Session, item_id: int, quantity: Decimal) -> None:
    """
    Descuenta `quantity` de los lotes del insumo en orden FEFO:
    primero los próximos a vencer, luego los antiguos sin fecha, luego el resto.
    Si no hay lotes (insumo no perecedero o sin registrar lotes), no hace nada.
    """
    if quantity <= 0:
        return
    batches = (
        db.query(InventoryBatch)
        .filter(InventoryBatch.item_id == item_id,
                InventoryBatch.is_depleted == False,        # noqa: E712
                InventoryBatch.remaining_quantity > 0)
        # Lotes con fecha de vencimiento más cercana primero; los sin fecha al final.
        .order_by(
            InventoryBatch.expiry_date.is_(None),    # False (con fecha) primero
            InventoryBatch.expiry_date.asc(),
            InventoryBatch.received_date.asc(),
        )
        .all()
    )
    remaining = Decimal(str(quantity))
    for batch in batches:
        if remaining <= 0:
            break
        take = min(batch.remaining_quantity, remaining)
        batch.remaining_quantity = batch.remaining_quantity - take
        if batch.remaining_quantity <= 0:
            batch.is_depleted = True
        remaining -= take
    # Si remaining > 0 no hay lotes suficientes — no es un error fatal;
    # el stock global del item ya se descontó. Sólo indica que hay desfase
    # entre lotes registrados y stock real (manual adjustments, etc).


def _restore_batches(db: Session, item_id: int, quantity: Decimal) -> None:
    """Devuelve cantidad al lote más reciente NO agotado (para cancelaciones)."""
    if quantity <= 0:
        return
    batch = (
        db.query(InventoryBatch)
        .filter(InventoryBatch.item_id == item_id)
        .order_by(InventoryBatch.received_date.desc())
        .first()
    )
    if not batch:
        return
    batch.remaining_quantity = (batch.remaining_quantity or Decimal("0")) + Decimal(str(quantity))
    batch.is_depleted = False


def deduct_inventory_for_order(db: Session, order: Order, user_id: Optional[int] = None):
    """
    Main inventory deduction logic. Called once per order after payment.
    Deducts ingredients from each order item's recipe, handles options,
    extras/removals, and combo components.
    """
    if order.inventory_discounted:
        return  # Prevent double-deduction

    for item in order.items:
        _deduct_for_order_item(db, item, user_id, order.id)

    order.inventory_discounted = True
    db.commit()


def _build_effective_ingredients(
    db: Session, order_item: OrderItem
) -> dict[int, Decimal]:
    """
    Build the effective ingredient map for a single order item,
    applying option overrides, extra/remove modifiers, and combo components.
    Mirrors the logic used in restore so both sides are consistent.
    """
    variant: ProductVariant = order_item.variant
    recipe: Recipe = db.query(Recipe).filter(Recipe.variant_id == variant.id).first()
    if not recipe:
        return {}

    # Base recipe ingredients
    effective: dict[int, Decimal] = {}
    for ri in recipe.items:
        effective[ri.inventory_item_id] = ri.quantity * order_item.quantity

    # Apply option overrides (e.g. Hades choosing "Doble Carne")
    for selected_opt in order_item.selected_options:
        overrides = db.query(RecipeOptionOverride).filter(
            RecipeOptionOverride.option_id == selected_opt.option_id
        ).all()
        for override in overrides:
            if override.replaces_item_id and override.replaces_item_id in effective:
                del effective[override.replaces_item_id]
            existing = effective.get(override.inventory_item_id, Decimal("0"))
            effective[override.inventory_item_id] = existing + (override.quantity * order_item.quantity)

    # Mark items removed by the customer (only if not deduct_if_removed)
    removed_items: set[int] = set()
    for mod in order_item.modifiers:
        if mod.modifier_type == "remove" and mod.inventory_item_id:
            recipe_item = next(
                (ri for ri in recipe.items if ri.inventory_item_id == mod.inventory_item_id),
                None,
            )
            if recipe_item and not recipe_item.deduct_if_removed:
                removed_items.add(mod.inventory_item_id)

    # Apply extras
    for mod in order_item.modifiers:
        if mod.modifier_type == "extra" and mod.inventory_item_id and mod.quantity > 0:
            existing = effective.get(mod.inventory_item_id, Decimal("0"))
            effective[mod.inventory_item_id] = existing + (mod.quantity * order_item.quantity)

    # Remove ingredients that were removed and should not be deducted
    for item_id in removed_items:
        effective.pop(item_id, None)

    # Combo components
    if variant.is_combo:
        combo_components = db.query(ComboComponent).filter(ComboComponent.is_active == True).all()
        for comp in combo_components:
            existing = effective.get(comp.inventory_item_id, Decimal("0"))
            effective[comp.inventory_item_id] = existing + (comp.quantity * order_item.quantity)

    return effective


def _deduct_for_order_item(db: Session, order_item: OrderItem, user_id: Optional[int], order_id: int):
    effective = _build_effective_ingredients(db, order_item)
    for inv_item_id, qty_to_deduct in effective.items():
        _apply_deduction(db, inv_item_id, qty_to_deduct, user_id, order_id)


def _apply_deduction(db: Session, item_id: int, quantity: Decimal, user_id: Optional[int], order_id: int):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        return

    qty_before = item.current_stock
    item.current_stock = item.current_stock - quantity

    movement = InventoryMovement(
        item_id=item_id,
        movement_type=MovementType.sale,
        quantity=-quantity,
        quantity_before=qty_before,
        quantity_after=item.current_stock,
        unit_cost=item.current_cost,
        reference_type="order",
        reference_id=order_id,
        user_id=user_id,
    )
    db.add(movement)

    # Consumir lotes FEFO si el insumo tiene lotes vivos
    _consume_batches_fefo(db, item_id, quantity)


def restore_inventory_for_order(db: Session, order: Order, user_id: Optional[int] = None):
    """
    Reverses inventory deduction when an order is cancelled.
    Uses the same effective-ingredient logic as deduction so the
    reversal is always exact — including options, modifiers, and combos.
    """
    if not order.inventory_discounted:
        return

    for order_item in order.items:
        effective = _build_effective_ingredients(db, order_item)
        for inv_item_id, qty_to_restore in effective.items():
            inv_item = db.query(InventoryItem).filter(InventoryItem.id == inv_item_id).first()
            if not inv_item:
                continue
            qty_before = inv_item.current_stock
            inv_item.current_stock += qty_to_restore
            movement = InventoryMovement(
                item_id=inv_item_id,
                movement_type=MovementType.return_order,
                quantity=qty_to_restore,
                quantity_before=qty_before,
                quantity_after=inv_item.current_stock,
                unit_cost=inv_item.current_cost,
                reference_type="order_cancel",
                reference_id=order.id,
                user_id=user_id,
            )
            db.add(movement)
            # Devolver al lote más reciente si existe
            _restore_batches(db, inv_item_id, qty_to_restore)

    order.inventory_discounted = False
    db.commit()


def apply_purchase(db: Session, purchase_item_id: int, item_id: int, quantity: Decimal,
                   unit_cost: Decimal, user_id: Optional[int] = None):
    """Apply a purchase to inventory: increase stock and update cost."""
    inv_item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not inv_item:
        return

    qty_before = inv_item.current_stock
    inv_item.current_stock += quantity
    inv_item.current_cost = unit_cost

    movement = InventoryMovement(
        item_id=item_id,
        movement_type=MovementType.purchase,
        quantity=quantity,
        quantity_before=qty_before,
        quantity_after=inv_item.current_stock,
        unit_cost=unit_cost,
        reference_type="purchase",
        reference_id=purchase_item_id,
        user_id=user_id,
    )
    db.add(movement)


def apply_stock_adjustment(db: Session, item_id: int, quantity: Decimal,
                           movement_type: MovementType, user_id: Optional[int],
                           notes: Optional[str] = None, reference_id: Optional[int] = None):
    """Apply a manual stock adjustment (positive or negative)."""
    inv_item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not inv_item:
        raise ValueError(f"Inventory item {item_id} not found")

    qty_before = inv_item.current_stock
    inv_item.current_stock += quantity

    movement = InventoryMovement(
        item_id=item_id,
        movement_type=movement_type,
        quantity=quantity,
        quantity_before=qty_before,
        quantity_after=inv_item.current_stock,
        unit_cost=inv_item.current_cost,
        reference_type="adjustment",
        reference_id=reference_id,
        user_id=user_id,
        notes=notes,
    )
    db.add(movement)
    db.commit()
    return inv_item


def calculate_recipe_cost(db: Session, variant_id: int) -> Decimal:
    """Calculate the estimated cost of a recipe based on current ingredient costs."""
    recipe = db.query(Recipe).filter(Recipe.variant_id == variant_id).first()
    if not recipe:
        return Decimal("0")

    total = Decimal("0")
    for ri in recipe.items:
        item = db.query(InventoryItem).filter(InventoryItem.id == ri.inventory_item_id).first()
        if item:
            total += ri.quantity * item.current_cost

    variant = db.query(ProductVariant).filter(ProductVariant.id == variant_id).first()
    if variant and variant.is_combo:
        combo_components = db.query(ComboComponent).filter(ComboComponent.is_active == True).all()
        for comp in combo_components:
            item = db.query(InventoryItem).filter(InventoryItem.id == comp.inventory_item_id).first()
            if item:
                total += comp.quantity * item.current_cost

    return total
