from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Numeric, Text, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base_class import Base
import enum


class ProductType(str, enum.Enum):
    burger = "burger"
    side = "side"
    drink = "drink"             # Bebida
    combo = "combo"             # Combo armado
    combo_component = "combo_component"
    promotion = "promotion"     # Promoción / oferta
    extra = "extra"             # Extra (ej. extra carne, extra queso)
    addition = "addition"       # Adición (ej. tocineta, jalapeños)
    simple = "simple"
    other = "other"


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    description = Column(Text)
    sort_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    products = relationship("Product", back_populates="category")


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    description = Column(Text)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    product_type = Column(Enum(ProductType), default=ProductType.burger)
    image_url = Column(String(500))
    is_active = Column(Boolean, default=True)
    has_combo = Column(Boolean, default=False)
    preparation_time_min = Column(Integer, default=15)  # minutos estimados de preparación
    sort_order = Column(Integer, default=0)
    # ── Kitchen routing (Rancho La Kamelia) ─────────────────────────────
    kitchen_section = Column(String(30), default="entradas", index=True)  # StationKey.value
    requires_neveras = Column(Boolean, default=False)         # principales/pescados/kids pasan por neveras
    requires_cooking_point = Column(Boolean, default=False)   # cortes (forzar selección de punto)
    is_sold_out = Column(Boolean, default=False, index=True)  # "86" rápido desde cocina
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    category = relationship("Category", back_populates="products")
    variants = relationship("ProductVariant", back_populates="product", cascade="all, delete-orphan")
    option_groups = relationship("ProductOptionGroup", back_populates="product", cascade="all, delete-orphan")
    images = relationship("ProductImage", back_populates="product", cascade="all, delete-orphan")


class ProductVariant(Base):
    """Represents sola/combo variants of a product"""
    __tablename__ = "product_variants"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    name = Column(String(100), nullable=False)  # "Sola", "Combo"
    price = Column(Numeric(12, 2), nullable=False)
    is_combo = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    product = relationship("Product", back_populates="variants")
    recipe = relationship("Recipe", back_populates="variant", uselist=False)
    order_items = relationship("OrderItem", back_populates="variant")


class ProductOptionGroup(Base):
    """Group of options for a product (e.g., 'Proteína' for Hades)"""
    __tablename__ = "product_option_groups"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    name = Column(String(100), nullable=False)
    description = Column(String(200))
    is_required = Column(Boolean, default=False)
    min_selections = Column(Integer, default=0)
    max_selections = Column(Integer, default=1)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    product = relationship("Product", back_populates="option_groups")
    options = relationship("ProductOption", back_populates="group", cascade="all, delete-orphan")


class ProductOption(Base):
    """Specific option within a group (e.g., 'Carne + Pollo', 'Doble Carne')"""
    __tablename__ = "product_options"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("product_option_groups.id"), nullable=False)
    name = Column(String(150), nullable=False)
    additional_price = Column(Numeric(12, 2), default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    group = relationship("ProductOptionGroup", back_populates="options")
    recipe_overrides = relationship("RecipeOptionOverride", back_populates="option")


class ProductImage(Base):
    __tablename__ = "product_images"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    url = Column(String(500), nullable=False)
    is_primary = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    product = relationship("Product", back_populates="images")


class Addon(Base):
    """
    Adición rápida aplicable a CUALQUIER producto del POS
    (doble queso, doble jalapeño, tocineta, etc.). Suma su precio al
    item del carrito y, si tiene inventory_item_id, descuenta inventario
    via OrderItemModifier al pagar.
    """
    __tablename__ = "addons"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    additional_price = Column(Numeric(12, 2), nullable=False, default=0)
    inventory_item_id = Column(Integer, ForeignKey("inventory_items.id"), nullable=True)
    inventory_quantity = Column(Numeric(14, 4), default=0)  # cuánto descontar del insumo
    icon = Column(String(20))  # emoji opcional
    is_active = Column(Boolean, default=True)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
