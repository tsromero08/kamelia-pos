from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List, Optional
from decimal import Decimal
from pydantic import BaseModel
from app.db.session import get_db
from app.schemas.product import (
    CategoryCreate, CategoryUpdate, CategoryOut,
    ProductCreate, ProductUpdate, ProductOut,
    ProductVariantCreate, ProductVariantUpdate, ProductVariantOut,
    ProductOptionGroupCreate, ProductOptionGroupOut,
    ProductOptionCreate, ProductOptionOut,
)
from app.models.product import Category, Product, ProductVariant, ProductOptionGroup, ProductOption, Addon
from app.api.deps import get_current_user, get_admin

router = APIRouter()


# ─── Addons (adiciones rápidas — Bloque 2) ───────────────────────────────────

class AddonIn(BaseModel):
    name: str
    additional_price: Decimal
    inventory_item_id: Optional[int] = None
    inventory_quantity: Decimal = Decimal("0")
    icon: Optional[str] = None
    is_active: bool = True
    sort_order: int = 0


class AddonOut(BaseModel):
    id: int
    name: str
    additional_price: Decimal
    inventory_item_id: Optional[int] = None
    inventory_quantity: Decimal
    icon: Optional[str] = None
    is_active: bool
    sort_order: int

    class Config:
        from_attributes = True


@router.get("/addons", response_model=List[AddonOut])
def list_addons(active_only: bool = True, db: Session = Depends(get_db), _=Depends(get_current_user)):
    q = db.query(Addon)
    if active_only:
        q = q.filter(Addon.is_active == True)
    return q.order_by(Addon.sort_order, Addon.name).all()


@router.post("/addons", response_model=AddonOut)
def create_addon(data: AddonIn, db: Session = Depends(get_db), _=Depends(get_admin)):
    addon = Addon(**data.model_dump())
    db.add(addon)
    db.commit()
    db.refresh(addon)
    return addon


@router.put("/addons/{addon_id}", response_model=AddonOut)
def update_addon(addon_id: int, data: AddonIn, db: Session = Depends(get_db), _=Depends(get_admin)):
    addon = db.query(Addon).filter(Addon.id == addon_id).first()
    if not addon:
        raise HTTPException(404, "Addon not found")
    for f, v in data.model_dump(exclude_unset=True).items():
        setattr(addon, f, v)
    db.commit()
    db.refresh(addon)
    return addon


@router.delete("/addons/{addon_id}")
def delete_addon(addon_id: int, db: Session = Depends(get_db), _=Depends(get_admin)):
    addon = db.query(Addon).filter(Addon.id == addon_id).first()
    if not addon:
        raise HTTPException(404, "Addon not found")
    addon.is_active = False  # soft delete para no romper history
    db.commit()
    return {"ok": True}


# ─── Categories ───────────────────────────────────────────────────────────────

@router.get("/categories", response_model=List[CategoryOut])
def list_categories(db: Session = Depends(get_db)):
    return db.query(Category).order_by(Category.sort_order).all()


@router.post("/categories", response_model=CategoryOut)
def create_category(data: CategoryCreate, db: Session = Depends(get_db), _=Depends(get_admin)):
    cat = Category(**data.model_dump())
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@router.put("/categories/{cat_id}", response_model=CategoryOut)
def update_category(cat_id: int, data: CategoryUpdate, db: Session = Depends(get_db), _=Depends(get_admin)):
    cat = db.query(Category).filter(Category.id == cat_id).first()
    if not cat:
        raise HTTPException(404, "Category not found")
    for f, v in data.model_dump(exclude_unset=True).items():
        setattr(cat, f, v)
    db.commit()
    db.refresh(cat)
    return cat


@router.delete("/categories/{cat_id}")
def delete_category(cat_id: int, db: Session = Depends(get_db), _=Depends(get_admin)):
    cat = db.query(Category).filter(Category.id == cat_id).first()
    if not cat:
        raise HTTPException(404, "Category not found")
    cat.is_active = False
    db.commit()
    return {"ok": True}


# ─── Products ─────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[ProductOut])
def list_products(active_only: bool = True, db: Session = Depends(get_db)):
    q = db.query(Product)
    if active_only:
        q = q.filter(Product.is_active == True)
    return q.order_by(Product.sort_order).all()


@router.get("/{product_id}", response_model=ProductOut)
def get_product(product_id: int, db: Session = Depends(get_db)):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(404, "Product not found")
    return p


@router.post("/upload-image")
def upload_product_image(file: UploadFile = File(...), _=Depends(get_admin)):
    """
    Sube una imagen de producto al servidor y devuelve la URL pública.
    Acepta jpg/png/webp hasta 3 MB. Imágenes guardadas en backend/uploads/products/.
    """
    import os, uuid, mimetypes
    allowed = {"image/jpeg", "image/png", "image/webp", "image/gif"}
    if file.content_type not in allowed:
        raise HTTPException(400, f"Tipo de archivo no permitido: {file.content_type}")

    # Carpeta donde se persisten las imágenes (servida en /uploads via main.py)
    base_dir = os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "uploads", "products")
    base_dir = os.path.abspath(base_dir)
    os.makedirs(base_dir, exist_ok=True)

    ext = mimetypes.guess_extension(file.content_type) or ".jpg"
    if ext == ".jpe":
        ext = ".jpg"
    fname = f"{uuid.uuid4().hex}{ext}"
    fpath = os.path.join(base_dir, fname)

    # Validar tamaño (3 MB máx)
    content = file.file.read()
    if len(content) > 3 * 1024 * 1024:
        raise HTTPException(413, "La imagen supera 3 MB")
    with open(fpath, "wb") as f:
        f.write(content)

    return {"url": f"/uploads/products/{fname}", "filename": fname, "size": len(content)}


@router.post("/", response_model=ProductOut)
def create_product(data: ProductCreate, db: Session = Depends(get_db), _=Depends(get_admin)):
    product = Product(
        name=data.name,
        description=data.description,
        category_id=data.category_id,
        product_type=data.product_type,
        image_url=data.image_url,
        is_active=data.is_active,
        has_combo=data.has_combo,
        preparation_time_min=data.preparation_time_min,
        sort_order=data.sort_order,
    )
    db.add(product)
    db.flush()

    for i, v in enumerate(data.variants):
        db.add(ProductVariant(
            product_id=product.id,
            name=v.name,
            price=v.price,
            is_combo=v.is_combo,
            is_active=v.is_active,
            sort_order=i,
        ))

    db.commit()
    db.refresh(product)
    return product


@router.put("/{product_id}", response_model=ProductOut)
def update_product(product_id: int, data: ProductUpdate, db: Session = Depends(get_db), _=Depends(get_admin)):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(404, "Product not found")
    for f, v in data.model_dump(exclude_unset=True).items():
        setattr(p, f, v)
    db.commit()
    db.refresh(p)
    return p


@router.delete("/{product_id}")
def delete_product(product_id: int, db: Session = Depends(get_db), _=Depends(get_admin)):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(404, "Product not found")
    p.is_active = False
    db.commit()
    return {"ok": True}


# ─── Variants ─────────────────────────────────────────────────────────────────

@router.post("/{product_id}/variants", response_model=ProductVariantOut)
def add_variant(product_id: int, data: ProductVariantCreate, db: Session = Depends(get_db), _=Depends(get_admin)):
    v = ProductVariant(product_id=product_id, **data.model_dump(exclude={"product_id"}))
    db.add(v)
    db.commit()
    db.refresh(v)
    return v


@router.put("/variants/{variant_id}", response_model=ProductVariantOut)
def update_variant(variant_id: int, data: ProductVariantUpdate, db: Session = Depends(get_db), _=Depends(get_admin)):
    v = db.query(ProductVariant).filter(ProductVariant.id == variant_id).first()
    if not v:
        raise HTTPException(404, "Variant not found")
    for f, val in data.model_dump(exclude_unset=True).items():
        setattr(v, f, val)
    db.commit()
    db.refresh(v)
    return v


# ─── Option Groups ─────────────────────────────────────────────────────────────

@router.post("/{product_id}/option-groups", response_model=ProductOptionGroupOut)
def create_option_group(product_id: int, data: ProductOptionGroupCreate, db: Session = Depends(get_db), _=Depends(get_admin)):
    group = ProductOptionGroup(
        product_id=product_id,
        name=data.name,
        description=data.description,
        is_required=data.is_required,
        min_selections=data.min_selections,
        max_selections=data.max_selections,
    )
    db.add(group)
    db.flush()
    for opt in (data.options or []):
        db.add(ProductOption(group_id=group.id, name=opt.name, additional_price=opt.additional_price))
    db.commit()
    db.refresh(group)
    return group


@router.post("/options", response_model=ProductOptionOut)
def create_option(data: ProductOptionCreate, db: Session = Depends(get_db), _=Depends(get_admin)):
    opt = ProductOption(**data.model_dump())
    db.add(opt)
    db.commit()
    db.refresh(opt)
    return opt
