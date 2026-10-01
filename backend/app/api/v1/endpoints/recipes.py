from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.db.session import get_db
from app.schemas.recipe import RecipeCreate, RecipeUpdate, RecipeOut, ComboComponentCreate, ComboComponentOut
from app.models.recipe import Recipe, RecipeItem, ComboComponent
from app.services.inventory_service import calculate_recipe_cost
from app.api.deps import get_current_user, get_admin

router = APIRouter()


@router.get("/", response_model=List[RecipeOut])
def list_recipes(db: Session = Depends(get_db), _=Depends(get_current_user)):
    recipes = db.query(Recipe).all()
    for r in recipes:
        r.estimated_cost = calculate_recipe_cost(db, r.variant_id)
    return recipes


@router.get("/{recipe_id}", response_model=RecipeOut)
def get_recipe(recipe_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    r = db.query(Recipe).filter(Recipe.id == recipe_id).first()
    if not r:
        raise HTTPException(404, "Recipe not found")
    r.estimated_cost = calculate_recipe_cost(db, r.variant_id)
    return r


@router.get("/by-variant/{variant_id}", response_model=RecipeOut)
def get_recipe_by_variant(variant_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    r = db.query(Recipe).filter(Recipe.variant_id == variant_id).first()
    if not r:
        raise HTTPException(404, "Recipe not found for this variant")
    r.estimated_cost = calculate_recipe_cost(db, variant_id)
    return r


@router.post("/", response_model=RecipeOut)
def create_recipe(data: RecipeCreate, db: Session = Depends(get_db), _=Depends(get_admin)):
    existing = db.query(Recipe).filter(Recipe.variant_id == data.variant_id).first()
    if existing:
        raise HTTPException(400, "Recipe already exists for this variant")

    recipe = Recipe(variant_id=data.variant_id, notes=data.notes, is_active=data.is_active)
    db.add(recipe)
    db.flush()

    for item in data.items:
        db.add(RecipeItem(recipe_id=recipe.id, **item.model_dump()))

    db.commit()
    db.refresh(recipe)
    recipe.estimated_cost = calculate_recipe_cost(db, recipe.variant_id)
    return recipe


@router.put("/{recipe_id}", response_model=RecipeOut)
def update_recipe(recipe_id: int, data: RecipeUpdate, db: Session = Depends(get_db), _=Depends(get_admin)):
    recipe = db.query(Recipe).filter(Recipe.id == recipe_id).first()
    if not recipe:
        raise HTTPException(404, "Recipe not found")

    if data.notes is not None:
        recipe.notes = data.notes
    if data.is_active is not None:
        recipe.is_active = data.is_active

    if data.items is not None:
        # Replace all recipe items
        db.query(RecipeItem).filter(RecipeItem.recipe_id == recipe_id).delete()
        for item in data.items:
            db.add(RecipeItem(recipe_id=recipe.id, **item.model_dump()))

    db.commit()
    db.refresh(recipe)
    recipe.estimated_cost = calculate_recipe_cost(db, recipe.variant_id)
    return recipe


# ─── Combo Components ─────────────────────────────────────────────────────────

@router.get("/combo-components", response_model=List[ComboComponentOut])
def list_combo_components(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(ComboComponent).filter(ComboComponent.is_active == True).all()


@router.post("/combo-components", response_model=ComboComponentOut)
def create_combo_component(data: ComboComponentCreate, db: Session = Depends(get_db), _=Depends(get_admin)):
    comp = ComboComponent(**data.model_dump())
    db.add(comp)
    db.commit()
    db.refresh(comp)
    return comp


@router.delete("/combo-components/{comp_id}")
def delete_combo_component(comp_id: int, db: Session = Depends(get_db), _=Depends(get_admin)):
    comp = db.query(ComboComponent).filter(ComboComponent.id == comp_id).first()
    if not comp:
        raise HTTPException(404, "Component not found")
    comp.is_active = False
    db.commit()
    return {"ok": True}
