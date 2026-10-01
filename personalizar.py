"""
Wizard de personalización del sistema POS para un restaurante nuevo.

Uso:
    python personalizar.py                  # interactivo
    python personalizar.py --no-input       # toma valores del JSON tal cual
    python personalizar.py --reset          # vuelve al template genérico

Lo que hace:
  1. Pregunta nombre/NIT/teléfono/dirección/dominio del restaurante.
  2. Reescribe restaurant.config.json.
  3. Regenera .env (PG user/password/db, FIRST_ADMIN_EMAIL, COMPOSE_PROJECT_NAME).
  4. Reescribe el <title> de frontend/index.html.
  5. Sobrescribe los defaults de frontend/src/config/branding.ts.
  6. Genera un SECRET_KEY aleatorio si el .env tiene el default.
  7. Imprime el siguiente paso.

Idempotente: correrlo dos veces produce el mismo resultado.
"""
from __future__ import annotations

import argparse
import json
import re
import secrets
import sys
import unicodedata
from pathlib import Path


ROOT = Path(__file__).resolve().parent
CONFIG_PATH = ROOT / "restaurant.config.json"
ENV_PATH = ROOT / ".env"
FRONTEND_INDEX = ROOT / "frontend" / "index.html"
FRONTEND_BRANDING = ROOT / "frontend" / "src" / "config" / "branding.ts"


TEMPLATE = {
    "_comentario": "Archivo MAESTRO de configuración del restaurante. Edita SOLO este archivo y ejecuta 'python personalizar.py' desde la raíz. Eso regenera todos los .env, container names, branding, etc.",
    "business": {
        "name": "Mi Restaurante",
        "short_name": "Restaurante",
        "tagline": "Sistema de Gestión POS",
        "type": "restaurante",
        "nit": "000000000-0",
        "phone": "0000000000",
        "address": "Dirección del restaurante",
        "city": "Ciudad",
        "country": "Colombia",
        "currency": "COP",
        "currency_symbol": "$",
    },
    "branding": {
        "primary_color": "#1a1a2e",
        "accent_color": "#e94560",
        "logo_filename": "logo.jpg",
        "favicon_filename": "favicon.png",
        "watermark_text": "RESTAURANTE",
        "kitchen_banner_text": "COCINA — RESTAURANTE",
    },
    "system": {
        "container_prefix": "restaurant",
        "db_name": "restaurant_pos",
        "db_user": "restaurant_user",
        "db_password": "restaurant_pass",
        "email_domain": "restaurante.local",
        "special_access_code": "ACCESS2026",
        "first_admin_password": "CambiaEstaClave123",
    },
    "license": {
        "key": "TITANOVA-DEMO",
        "client": "Cliente Demo",
        "expires": "",
        "contact": "Software Titanova - 3013896861",
    },
    "deploy": {
        "domain": "cliente.midominio.com",
        "backup_passphrase": "CAMBIAR-PASSPHRASE-BACKUP",
    },
}


# ─── Helpers ───────────────────────────────────────────────────────────
def slugify(value: str, fallback: str = "restaurant") -> str:
    """'Pizzería Lupita' -> 'pizzeria_lupita'."""
    if not value:
        return fallback
    norm = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    norm = norm.lower()
    norm = re.sub(r"[^a-z0-9]+", "_", norm).strip("_")
    return norm or fallback


def ask(prompt: str, default: str) -> str:
    raw = input(f"{prompt} [{default}]: ").strip()
    return raw or default


def load_config() -> dict:
    if CONFIG_PATH.exists():
        try:
            return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"  ! No se pudo leer {CONFIG_PATH.name} ({e}). Usando template.")
    return json.loads(json.dumps(TEMPLATE))  # deep copy


def merge_template(cfg: dict) -> dict:
    """Asegura que existan todas las claves del TEMPLATE."""
    base = json.loads(json.dumps(TEMPLATE))
    for section, values in cfg.items():
        if section == "_comentario":
            continue
        if section in base and isinstance(values, dict):
            base[section].update(values)
        else:
            base[section] = values
    return base


def save_config(cfg: dict) -> None:
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def gen_secret() -> str:
    return secrets.token_urlsafe(64)


# ─── Wizard interactivo ────────────────────────────────────────────────
def run_wizard(cfg: dict) -> dict:
    print("\n══════════════════════════════════════════════")
    print(" Wizard de personalización del sistema POS")
    print(" Enter para conservar el valor actual.")
    print("══════════════════════════════════════════════\n")

    b = cfg["business"]
    s = cfg["system"]
    lic = cfg["license"]
    dep = cfg["deploy"]
    br = cfg["branding"]

    b["name"]       = ask("Nombre comercial del restaurante", b["name"])
    b["short_name"] = ask("Nombre corto (sidebar/recibos)", b.get("short_name") or b["name"].split()[0])
    b["type"]       = ask("Tipo (restaurante, pizzería, café, bar, etc.)", b["type"])
    b["nit"]        = ask("NIT / Identificación fiscal", b["nit"])
    b["phone"]      = ask("Teléfono principal", b["phone"])
    b["address"]    = ask("Dirección", b["address"])
    b["city"]       = ask("Ciudad", b["city"])
    b["country"]    = ask("País", b["country"])
    b["currency_symbol"] = ask("Símbolo de moneda", b["currency_symbol"])

    suggested_domain = slugify(b["name"]) + ".com"
    s["email_domain"] = ask("Dominio para emails (admin@...)", s.get("email_domain") or suggested_domain)

    suggested_prefix = slugify(b["short_name"] or b["name"])
    s["container_prefix"] = ask("Prefijo de contenedores Docker", s.get("container_prefix") or suggested_prefix)
    s["db_name"]     = ask("Nombre de la base de datos", f"{s['container_prefix']}_pos")
    s["db_user"]     = ask("Usuario de la base de datos", f"{s['container_prefix']}_user")
    s["db_password"] = ask("Password de la base de datos", s.get("db_password") or f"{s['container_prefix']}_pass")
    s["special_access_code"] = ask("Código de acceso para acciones críticas", s["special_access_code"])
    s["first_admin_password"] = ask("Password inicial del admin", s["first_admin_password"])

    br["watermark_text"]      = ask("Texto de marca de agua", b["name"].upper())
    br["kitchen_banner_text"] = ask("Banner en ticket de cocina", f"COCINA — {b['short_name'].upper()}")

    lic["client"]  = ask("Nombre del cliente para la licencia", b["name"])
    lic["expires"] = ask("Vencimiento de la licencia (YYYY-MM-DD o vacío)", lic.get("expires") or "")

    dep["domain"] = ask("Dominio público para despliegue VPS", dep.get("domain") or f"pos.{slugify(b['short_name'])}.co")

    return cfg


# ─── Acciones de reescritura ───────────────────────────────────────────
def write_env(cfg: dict) -> None:
    s = cfg["system"]
    domain = s["email_domain"]
    prefix = s["container_prefix"]
    db_name = s["db_name"]
    db_user = s["db_user"]
    db_pass = s["db_password"]

    # Conservar SECRET_KEY si ya hay uno seguro; generar uno si está en default.
    secret_key = gen_secret()
    if ENV_PATH.exists():
        existing = ENV_PATH.read_text(encoding="utf-8")
        m = re.search(r"^SECRET_KEY=(.+)$", existing, flags=re.MULTILINE)
        if m:
            current = m.group(1).strip()
            if current and "change-in-production" not in current.lower() and len(current) >= 40:
                secret_key = current

    content = f"""# Generado por personalizar.py — no edites manualmente salvo SECRET_KEY.
DATABASE_URL=sqlite:///./{db_name}.db
SECRET_KEY={secret_key}

# Postgres (cuando se levanta docker-compose)
POSTGRES_USER={db_user}
POSTGRES_PASSWORD={db_pass}
POSTGRES_DB={db_name}

# Compose project — aísla los contenedores de este cliente
COMPOSE_PROJECT_NAME={prefix}

# Admin inicial (lo crea seed.py la primera vez)
FIRST_ADMIN_EMAIL=admin@{domain}
FIRST_ADMIN_PASSWORD=CambiaEstaClave123
FIRST_ADMIN_NAME=Administrador

# Código especial (acciones críticas)
SPECIAL_ACCESS_CODE={s['special_access_code']}

# Branding (opcional — el JSON ya basta, esto es solo override)
BRAND_BUSINESS_NAME={cfg['business']['name']}
BRAND_BUSINESS_NIT={cfg['business']['nit']}
BRAND_BUSINESS_PHONE={cfg['business']['phone']}
BRAND_SYSTEM_EMAIL_DOMAIN={domain}

# Licencia
LICENSE_KEY={cfg['license']['key']}
LICENSE_CLIENT={cfg['license']['client']}
LICENSE_EXPIRES={cfg['license']['expires']}
LICENSE_CONTACT={cfg['license']['contact']}

BACKEND_CORS_ORIGINS=["http://localhost:3000","http://localhost:80","http://localhost"]
BLOCK_SALE_ON_LOW_STOCK=false
DEBUG=false
"""
    ENV_PATH.write_text(content, encoding="utf-8")
    print(f"  ✓ .env regenerado")


def write_frontend_title(cfg: dict) -> None:
    if not FRONTEND_INDEX.exists():
        print(f"  ! {FRONTEND_INDEX} no existe (omitido)")
        return
    name = cfg["business"]["name"]
    html = FRONTEND_INDEX.read_text(encoding="utf-8")
    new_html = re.sub(
        r"<title>.*?</title>",
        f"<title>{name}</title>",
        html,
        count=1,
        flags=re.DOTALL,
    )
    FRONTEND_INDEX.write_text(new_html, encoding="utf-8")
    print(f"  ✓ frontend/index.html title actualizado")


def write_frontend_branding(cfg: dict) -> None:
    """
    Reescribe los valores DEFAULT del objeto BRANDING en branding.ts.
    No toca la estructura del archivo, solo los literales string.
    """
    if not FRONTEND_BRANDING.exists():
        print(f"  ! {FRONTEND_BRANDING} no existe (omitido)")
        return
    text = FRONTEND_BRANDING.read_text(encoding="utf-8")

    b = cfg["business"]
    s = cfg["system"]
    br = cfg["branding"]
    lic = cfg["license"]

    replacements = {
        "name":              b["name"],
        "shortName":         b["short_name"],
        "tagline":           b["tagline"],
        "nit":               b["nit"],
        "phone":             b["phone"],
        "address":           b["address"],
        "city":              b["city"],
        "country":           b["country"],
        "currencySymbol":    b["currency_symbol"],
        "emailDomain":       s["email_domain"],
        "watermarkText":     br["watermark_text"],
        "kitchenBannerText": br["kitchen_banner_text"],
        "licenseClient":     lic["client"],
        "licenseContact":    lic["contact"],
    }

    for key, value in replacements.items():
        # match: key: "anything", o key: 'anything',
        pattern = re.compile(
            rf'(\b{re.escape(key)}\b\s*:\s*)(["\'])(?:\\.|(?!\2).)*\2',
        )
        escaped = value.replace("\\", "\\\\").replace('"', '\\"')
        text, n = pattern.subn(rf'\1"{escaped}"', text, count=1)
        if n == 0:
            print(f"    ! no se encontró '{key}' en branding.ts (saltado)")

    FRONTEND_BRANDING.write_text(text, encoding="utf-8")
    print(f"  ✓ frontend/src/config/branding.ts actualizado")


def reset_to_template() -> None:
    print("Reseteando a template genérico...")
    save_config(json.loads(json.dumps(TEMPLATE)))
    print(f"  ✓ restaurant.config.json sobrescrito con defaults")


def summary(cfg: dict) -> None:
    b, s = cfg["business"], cfg["system"]
    print("\n══════════════════════════════════════════════")
    print(" Personalización completada ✓")
    print("══════════════════════════════════════════════")
    print(f"  Restaurante : {b['name']}")
    print(f"  NIT         : {b['nit']}")
    print(f"  Dominio     : {s['email_domain']}")
    print(f"  Admin login : admin@{s['email_domain']}")
    print(f"  Password    : {s['first_admin_password']}")
    print(f"  Compose     : {s['container_prefix']}")
    print()
    print(" Siguiente paso:")
    print("   → INSTALAR.bat    (Windows, Docker Desktop)")
    print("   → o:  docker compose up --build")
    print()
    print(" Carga de productos:")
    print("   1. Edita backend/data/{inventario,productos,recetas}.csv")
    print("   2. cd backend && python -m app.db.seed_products")
    print("   o agrégalos desde /admin/products en el panel.")
    print()


# ─── Main ──────────────────────────────────────────────────────────────
def main() -> int:
    parser = argparse.ArgumentParser(description="Personalizar el sistema POS para un restaurante.")
    parser.add_argument("--no-input", action="store_true",
                        help="No hace preguntas; toma todo del restaurant.config.json actual.")
    parser.add_argument("--reset", action="store_true",
                        help="Vuelve restaurant.config.json al template genérico.")
    args = parser.parse_args()

    if args.reset:
        reset_to_template()
        cfg = load_config()
    else:
        cfg = merge_template(load_config())
        if not args.no_input:
            try:
                cfg = run_wizard(cfg)
            except (KeyboardInterrupt, EOFError):
                print("\n\nCancelado.")
                return 1

    save_config(cfg)
    write_env(cfg)
    write_frontend_title(cfg)
    write_frontend_branding(cfg)
    summary(cfg)
    return 0


if __name__ == "__main__":
    sys.exit(main())
