from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.db.session import get_db
from app.schemas.user import LoginRequest, Token, UserOut
from app.models.user import User
from app.models.audit import AuditLog
from app.core.security import verify_password, create_access_token
from app.core.config import settings
from app.api.deps import get_current_user, get_admin
from app.services import system_settings

router = APIRouter()


class SpecialCodeRequest(BaseModel):
    code: str
    action: str | None = None  # contexto para el log: "modify_inventory", "create_expense", etc.


@router.post("/login", response_model=Token)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")

    token = create_access_token({"sub": str(user.id)})
    return Token(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/verify-special-code")
def verify_special_code(
    data: SpecialCodeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Verifica el Código de Acceso Especial requerido para acciones críticas:
    alterar inventarios, ingresar gastos, modificar datos contables.

    El código se configura en settings.SPECIAL_ACCESS_CODE (env: SPECIAL_ACCESS_CODE).
    Toda verificación (exitosa o fallida) queda en AuditLog para trazabilidad.
    """
    expected = (system_settings.get_special_access_code() or "").strip()
    provided = (data.code or "").strip()
    ok = bool(expected) and provided == expected

    db.add(AuditLog(
        user_id=current_user.id,
        action="verify_special_code" if ok else "verify_special_code_failed",
        entity_type="auth",
        entity_id=current_user.id,
        new_value={"action_context": data.action, "ok": ok},
    ))
    db.commit()

    if not ok:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Código de Acceso Especial incorrecto.",
        )
    return {"ok": True, "verified_at": __import__("datetime").datetime.utcnow().isoformat()}


class ChangeSpecialCodeRequest(BaseModel):
    current_code: str
    new_code: str


@router.post("/change-special-code")
def change_special_code(
    data: ChangeSpecialCodeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin),
):
    """
    Cambia el Código de Acceso Especial. Requiere:
    - Rol Administrador
    - El código actual correcto (para que un token robado no baste)
    - Nuevo código entre 4 y 50 caracteres
    """
    current = (system_settings.get_special_access_code() or "").strip()
    provided = (data.current_code or "").strip()
    if not current or provided != current:
        db.add(AuditLog(
            user_id=current_user.id,
            action="change_special_code_failed",
            entity_type="auth",
            entity_id=current_user.id,
            new_value={"reason": "current_code_mismatch"},
        ))
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="El código actual no es correcto.",
        )
    new_code = (data.new_code or "").strip()
    if len(new_code) < 4 or len(new_code) > 50:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El nuevo código debe tener entre 4 y 50 caracteres.",
        )
    system_settings.set_value("special_access_code", new_code)
    db.add(AuditLog(
        user_id=current_user.id,
        action="change_special_code",
        entity_type="auth",
        entity_id=current_user.id,
        new_value={"length": len(new_code)},
    ))
    db.commit()
    return {"ok": True}
