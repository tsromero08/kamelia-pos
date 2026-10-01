from sqlalchemy import Column, Integer, Boolean, DateTime, ForeignKey, Numeric, Text, String
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base_class import Base


class Recipe(Base):
    """A recipe is associated with a specific product variant"""
    __tablename__ = "recipes"

    id = Column(Integer, primary_key=True, index=True)
    variant_id = Column(Integer, ForeignKey("product_variants.id"), unique=True, nullable=False)
    notes = Column(Text)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    variant = relationship("ProductVariant", back_populates="recipe")
    items = relationship("RecipeItem", back_populates="recipe", cascade="all, delete-orphan")


class RecipeItem(Base):
    """Each ingredient line in a recipe"""
    __tablename__ = "recipe_items"

    id = Column(Integer, primary_key=True, index=True)
    recipe_id = Column(Integer, ForeignKey("recipes.id"), nullable=False)
    inventory_item_id = Column(Integer, ForeignKey("inventory_items.id"), nullable=False)
    quantity = Column(Numeric(14, 4), nullable=False)
    is_optional = Column(Boolean, default=False)
    # If True, removing this ingredient from order does NOT save inventory
    deduct_if_removed = Column(Boolean, default=False)
    notes = Column(String(200))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    recipe = relationship("Recipe", back_populates="items")
    inventory_item = relationship("InventoryItem", back_populates="recipe_items")


class RecipeOptionOverride(Base):
    """
    Override recipe items for specific product options.
    Example: Hades with 'Doble Carne' replaces pollo with extra carne.
    """
    __tablename__ = "recipe_option_overrides"

    id = Column(Integer, primary_key=True, index=True)
    option_id = Column(Integer, ForeignKey("product_options.id"), nullable=False)
    # Item to add
    inventory_item_id = Column(Integer, ForeignKey("inventory_items.id"), nullable=False)
    quantity = Column(Numeric(14, 4), nullable=False)
    # If True, this line replaces a base recipe item instead of adding
    replaces_item_id = Column(Integer, ForeignKey("inventory_items.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    option = relationship("ProductOption", back_populates="recipe_overrides")
    inventory_item = relationship("InventoryItem", foreign_keys=[inventory_item_id])
    replaces_item = relationship("InventoryItem", foreign_keys=[replaces_item_id])


class ComboComponent(Base):
    """Configurable combo components (papas, bebida, etc.)"""
    __tablename__ = "combo_components"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    inventory_item_id = Column(Integer, ForeignKey("inventory_items.id"), nullable=False)
    quantity = Column(Numeric(14, 4), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    inventory_item = relationship("InventoryItem")
