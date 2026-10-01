import os
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from app.core.config import settings
from app.core import branding
from app.api.v1.router import api_router
from app.websocket.kitchen import kitchen_manager
from app.websocket.system import system_manager
import time
import collections

# ── Rate limiter simple en memoria ────────────────────────────────────────
_rate_store: dict = {}

class SecurityMiddleware(BaseHTTPMiddleware):
    """Agrega headers de seguridad y rate limiting básico."""

    async def dispatch(self, request: Request, call_next):
        # Rate limiting: 120 req/min por IP
        client_ip = request.client.host if request.client else "unknown"
        now = time.time()
        window = 60  # segundos

        if client_ip not in _rate_store:
            _rate_store[client_ip] = collections.deque()
        calls = _rate_store[client_ip]
        # Limpiar llamadas antiguas
        while calls and calls[0] < now - window:
            calls.popleft()

        # Límites estrictos en endpoints sensibles
        if "/auth/login" in request.url.path:
            limit = 10
        elif "/auth/verify-special-code" in request.url.path:
            limit = 5  # Bloque 1: anti brute-force del código especial
        else:
            limit = 120
        if len(calls) >= limit:
            return JSONResponse(
                status_code=429,
                content={"detail": "Demasiadas solicitudes. Espera un momento."},
            )
        calls.append(now)

        response = await call_next(request)

        # Headers de seguridad en todas las respuestas
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        # Ocultar que usamos FastAPI/Python
        response.headers["Server"] = "RestaurantPos"
        return response


app = FastAPI(
    title=f"{branding.business_name()} - Sistema de Gestión",
    description=f"Sistema POS, inventario, cocina y finanzas para {branding.business_name()}",
    version="1.0.0",
    # En producción: deshabilitar docs para no exponer la API
    docs_url=None if not settings.DEBUG else "/docs",
    redoc_url=None if not settings.DEBUG else "/redoc",
    openapi_url=None if not settings.DEBUG else "/openapi.json",
)

app.add_middleware(SecurityMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Carpeta de uploads (imágenes de productos) — servida en /uploads/...
_uploads_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "uploads"))
os.makedirs(os.path.join(_uploads_dir, "products"), exist_ok=True)
app.mount("/uploads", StaticFiles(directory=_uploads_dir), name="uploads")

app.include_router(api_router, prefix="/api/v1")


@app.on_event("startup")
async def capture_event_loop():
    """
    Captura el event loop principal al arrancar para que los endpoints sync
    puedan hacer broadcasts WebSocket via run_coroutine_threadsafe.
    """
    import asyncio as _asyncio
    from app.services import order_service, kitchen_service
    loop = _asyncio.get_running_loop()
    order_service.MAIN_EVENT_LOOP = loop
    kitchen_service.MAIN_LOOP = loop


@app.on_event("startup")
def warn_insecure_defaults():
    """Avisa si quedan defaults inseguros en producción."""
    warnings = []
    if "dev-secret-key" in (settings.SECRET_KEY or ""):
        warnings.append("SECRET_KEY usa el default de desarrollo — genera uno aleatorio con secrets.token_urlsafe(64) y ponlo en .env")
    if settings.FIRST_ADMIN_PASSWORD == "CambiaEstaClave123" and not settings.DEBUG:
        warnings.append("FIRST_ADMIN_PASSWORD sigue siendo el default. Cambia la contraseña del admin desde la UI.")
    if not settings.DEBUG:
        # Solo en produccion (DEBUG=False) gritamos las advertencias
        for w in warnings:
            print(f"[security WARNING] {w}")


@app.on_event("startup")
def start_auto_closure_scheduler():
    """Bloque 5: arranca el cierre automático de caja a las 23:59."""
    try:
        from app.services.scheduler import start_scheduler
        start_scheduler()
    except Exception as e:
        print(f"[startup] scheduler no iniciado: {e}")


@app.on_event("shutdown")
def shutdown_scheduler():
    try:
        from app.services.scheduler import stop_scheduler
        stop_scheduler()
    except Exception:
        pass


@app.on_event("startup")
def autoseed_runtime():
    """
    Autoseed/auto-migrate al arrancar:
    - Garantiza rol 'Mesero' + usuario default
    - Agrega columna products.preparation_time_min si no existe (SQLite/Postgres)
    """
    try:
        from sqlalchemy import inspect, text
        from app.db.session import SessionLocal, engine
        from app.models.user import Role, User
        from app.core.security import get_password_hash

        # 1) Migración suave: products.preparation_time_min
        try:
            insp = inspect(engine)
            cols = [c["name"] for c in insp.get_columns("products")]
            if "preparation_time_min" not in cols:
                with engine.begin() as conn:
                    conn.execute(text("ALTER TABLE products ADD COLUMN preparation_time_min INTEGER DEFAULT 15"))
        except Exception as e:
            print(f"[autoseed] no se pudo agregar preparation_time_min: {e}")

        # 1b) Migración suave: daily_summaries.payment_methods + products_sold (JSON)
        try:
            insp = inspect(engine)
            cols = [c["name"] for c in insp.get_columns("daily_summaries")]
            with engine.begin() as conn:
                if "payment_methods" not in cols:
                    conn.execute(text("ALTER TABLE daily_summaries ADD COLUMN payment_methods JSON"))
                if "products_sold" not in cols:
                    conn.execute(text("ALTER TABLE daily_summaries ADD COLUMN products_sold JSON"))
        except Exception as e:
            print(f"[autoseed] no se pudo migrar daily_summaries: {e}")

        # 1c) Migración suave: Bloques 2/3/4 — nuevas columnas en orders + payments + tablas nuevas
        try:
            insp = inspect(engine)
            order_cols = [c["name"] for c in insp.get_columns("orders")]
            payment_cols = [c["name"] for c in insp.get_columns("payments")]
            tables = insp.get_table_names()
            with engine.begin() as conn:
                # orders: Bloque 2 (cortesía), Bloque 3 (delivery), Bloque 4 (fiscal)
                if "is_courtesy" not in order_cols:
                    conn.execute(text("ALTER TABLE orders ADD COLUMN is_courtesy BOOLEAN DEFAULT 0 NOT NULL"))
                if "delivery_mode" not in order_cols:
                    conn.execute(text("ALTER TABLE orders ADD COLUMN delivery_mode VARCHAR(20) DEFAULT 'none' NOT NULL"))
                if "delivery_fee" not in order_cols:
                    conn.execute(text("ALTER TABLE orders ADD COLUMN delivery_fee NUMERIC(12,2) DEFAULT 0 NOT NULL"))
                if "customer_type" not in order_cols:
                    conn.execute(text("ALTER TABLE orders ADD COLUMN customer_type VARCHAR(20) DEFAULT 'natural' NOT NULL"))
                if "tax_type" not in order_cols:
                    conn.execute(text("ALTER TABLE orders ADD COLUMN tax_type VARCHAR(80)"))
                if "tax_id" not in order_cols:
                    conn.execute(text("ALTER TABLE orders ADD COLUMN tax_id VARCHAR(40)"))
                # payments: Bloque 4 (split)
                if "is_split" not in payment_cols:
                    conn.execute(text("ALTER TABLE payments ADD COLUMN is_split BOOLEAN DEFAULT 0 NOT NULL"))
                # nuevas tablas: addons, payment_splits
                if "addons" not in tables:
                    conn.execute(text(
                        "CREATE TABLE addons ("
                        "id INTEGER PRIMARY KEY, "
                        "name VARCHAR(150) NOT NULL, "
                        "additional_price NUMERIC(12,2) NOT NULL DEFAULT 0, "
                        "inventory_item_id INTEGER REFERENCES inventory_items(id), "
                        "inventory_quantity NUMERIC(14,4) DEFAULT 0, "
                        "icon VARCHAR(20), "
                        "is_active BOOLEAN DEFAULT 1, "
                        "sort_order INTEGER DEFAULT 0, "
                        "created_at DATETIME DEFAULT CURRENT_TIMESTAMP)"
                    ))
                if "payment_splits" not in tables:
                    conn.execute(text(
                        "CREATE TABLE payment_splits ("
                        "id INTEGER PRIMARY KEY, "
                        "payment_id INTEGER NOT NULL REFERENCES payments(id), "
                        "payment_method VARCHAR(20) NOT NULL, "
                        "amount NUMERIC(12,2) NOT NULL, "
                        "reference VARCHAR(200), "
                        "created_at DATETIME DEFAULT CURRENT_TIMESTAMP)"
                    ))
                # Customers: datos fiscales persistentes (autocompletado POS)
                customer_cols = [c["name"] for c in insp.get_columns("customers")]
                if "tax_id" not in customer_cols:
                    conn.execute(text("ALTER TABLE customers ADD COLUMN tax_id VARCHAR(40)"))
                if "tax_type" not in customer_cols:
                    conn.execute(text("ALTER TABLE customers ADD COLUMN tax_type VARCHAR(80)"))
                if "customer_type" not in customer_cols:
                    conn.execute(text("ALTER TABLE customers ADD COLUMN customer_type VARCHAR(20) DEFAULT 'natural'"))

                # Inventory batches (lotes y fechas de vencimiento)
                if "inventory_batches" not in tables:
                    conn.execute(text(
                        "CREATE TABLE inventory_batches ("
                        "id INTEGER PRIMARY KEY, "
                        "item_id INTEGER NOT NULL REFERENCES inventory_items(id), "
                        "batch_code VARCHAR(80), "
                        "initial_quantity NUMERIC(14,4) NOT NULL, "
                        "remaining_quantity NUMERIC(14,4) NOT NULL, "
                        "unit_cost NUMERIC(12,4) DEFAULT 0, "
                        "received_date DATETIME DEFAULT CURRENT_TIMESTAMP, "
                        "expiry_date DATETIME, "
                        "supplier_id INTEGER REFERENCES suppliers(id), "
                        "purchase_id INTEGER REFERENCES purchases(id), "
                        "is_depleted BOOLEAN DEFAULT 0, "
                        "notes TEXT, "
                        "created_at DATETIME DEFAULT CURRENT_TIMESTAMP)"
                    ))

                # Cash sessions (apertura / cierre de caja por turno)
                if "cash_sessions" not in tables:
                    conn.execute(text(
                        "CREATE TABLE cash_sessions ("
                        "id INTEGER PRIMARY KEY, "
                        "cashier_id INTEGER NOT NULL REFERENCES users(id), "
                        "opened_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                        "closed_at DATETIME, "
                        "initial_cash NUMERIC(12,2) NOT NULL DEFAULT 0, "
                        "counted_cash NUMERIC(12,2), "
                        "expected_cash NUMERIC(12,2), "
                        "discrepancy NUMERIC(12,2), "
                        "status VARCHAR(20) DEFAULT 'open', "
                        "opening_notes TEXT, "
                        "closing_notes TEXT, "
                        "created_at DATETIME DEFAULT CURRENT_TIMESTAMP)"
                    ))

                # payments.session_id (link a la sesión de caja)
                payment_cols2 = [c["name"] for c in insp.get_columns("payments")]
                if "cash_session_id" not in payment_cols2:
                    conn.execute(text("ALTER TABLE payments ADD COLUMN cash_session_id INTEGER REFERENCES cash_sessions(id)"))
        except Exception as e:
            print(f"[autoseed] no se pudo migrar columnas/tablas nuevas: {e}")

        # 1c-bis) KITCHEN STATIONS (Rancho La Kamelia — flujo cocina por estaciones)
        try:
            insp = inspect(engine)
            tables = insp.get_table_names()
            with engine.begin() as conn:
                # Agregar columnas a products
                product_cols = [c["name"] for c in insp.get_columns("products")]
                if "kitchen_section" not in product_cols:
                    conn.execute(text("ALTER TABLE products ADD COLUMN kitchen_section VARCHAR(30) DEFAULT 'entradas'"))
                if "requires_neveras" not in product_cols:
                    conn.execute(text("ALTER TABLE products ADD COLUMN requires_neveras BOOLEAN DEFAULT 0 NOT NULL"))
                if "requires_cooking_point" not in product_cols:
                    conn.execute(text("ALTER TABLE products ADD COLUMN requires_cooking_point BOOLEAN DEFAULT 0 NOT NULL"))
                if "is_sold_out" not in product_cols:
                    conn.execute(text("ALTER TABLE products ADD COLUMN is_sold_out BOOLEAN DEFAULT 0 NOT NULL"))
                # OrderItem cooking_point
                item_cols = [c["name"] for c in insp.get_columns("order_items")]
                if "cooking_point" not in item_cols:
                    conn.execute(text("ALTER TABLE order_items ADD COLUMN cooking_point VARCHAR(20) DEFAULT 'none'"))
                # kitchen_stations
                if "kitchen_stations" not in tables:
                    conn.execute(text(
                        "CREATE TABLE kitchen_stations ("
                        "id INTEGER PRIMARY KEY, "
                        "key VARCHAR(30) UNIQUE NOT NULL, "
                        "display_name VARCHAR(80) NOT NULL, "
                        "color VARCHAR(20) DEFAULT '#d4af37', "
                        "max_concurrent INTEGER DEFAULT 10, "
                        "is_active BOOLEAN DEFAULT 1, "
                        "sort_order INTEGER DEFAULT 0, "
                        "created_at DATETIME DEFAULT CURRENT_TIMESTAMP)"
                    ))
                # order_item_stations
                if "order_item_stations" not in tables:
                    conn.execute(text(
                        "CREATE TABLE order_item_stations ("
                        "id INTEGER PRIMARY KEY, "
                        "order_item_id INTEGER NOT NULL REFERENCES order_items(id), "
                        "station_id INTEGER NOT NULL REFERENCES kitchen_stations(id), "
                        "sequence INTEGER DEFAULT 0, "
                        "status VARCHAR(20) DEFAULT 'queued' NOT NULL, "
                        "enqueued_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                        "in_prep_at DATETIME, "
                        "ready_at DATETIME, "
                        "dispatched_at DATETIME, "
                        "operator_id INTEGER REFERENCES users(id), "
                        "notes TEXT)"
                    ))
                    conn.execute(text("CREATE INDEX ix_ois_item ON order_item_stations(order_item_id)"))
                    conn.execute(text("CREATE INDEX ix_ois_station ON order_item_stations(station_id)"))
                    conn.execute(text("CREATE INDEX ix_ois_status ON order_item_stations(status)"))
                # dispatch_queues
                if "dispatch_queues" not in tables:
                    conn.execute(text(
                        "CREATE TABLE dispatch_queues ("
                        "id INTEGER PRIMARY KEY, "
                        "order_id INTEGER NOT NULL REFERENCES orders(id), "
                        "queue_type VARCHAR(20) NOT NULL, "
                        "status VARCHAR(20) DEFAULT 'queued' NOT NULL, "
                        "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                        "assigned_to_id INTEGER REFERENCES users(id), "
                        "assigned_at DATETIME, "
                        "dispatched_at DATETIME, "
                        "dispatched_by_id INTEGER REFERENCES users(id), "
                        "notes TEXT)"
                    ))
                    conn.execute(text("CREATE INDEX ix_dq_order ON dispatch_queues(order_id)"))
                    conn.execute(text("CREATE INDEX ix_dq_type ON dispatch_queues(queue_type)"))
                    conn.execute(text("CREATE INDEX ix_dq_status ON dispatch_queues(status)"))
                    conn.execute(text("CREATE INDEX ix_dq_created ON dispatch_queues(created_at)"))
                # dispatcher_shifts
                if "dispatcher_shifts" not in tables:
                    conn.execute(text(
                        "CREATE TABLE dispatcher_shifts ("
                        "id INTEGER PRIMARY KEY, "
                        "user_id INTEGER NOT NULL REFERENCES users(id), "
                        "queue_type VARCHAR(20) NOT NULL, "
                        "is_active BOOLEAN DEFAULT 1, "
                        "started_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                        "ended_at DATETIME)"
                    ))
                    conn.execute(text("CREATE INDEX ix_ds_user ON dispatcher_shifts(user_id)"))
                    conn.execute(text("CREATE INDEX ix_ds_type ON dispatcher_shifts(queue_type)"))
                    conn.execute(text("CREATE INDEX ix_ds_active ON dispatcher_shifts(is_active)"))
                # tip percent default + tables
                order_cols = [c["name"] for c in insp.get_columns("orders")]
                if "tip_amount" not in order_cols:
                    conn.execute(text("ALTER TABLE orders ADD COLUMN tip_amount NUMERIC(12,2) DEFAULT 0 NOT NULL"))
                if "tip_percent" not in order_cols:
                    conn.execute(text("ALTER TABLE orders ADD COLUMN tip_percent NUMERIC(5,2) DEFAULT 10 NOT NULL"))
                if "served_by_id" not in order_cols:
                    conn.execute(text("ALTER TABLE orders ADD COLUMN served_by_id INTEGER REFERENCES users(id)"))
                if "zone" not in order_cols:
                    conn.execute(text("ALTER TABLE orders ADD COLUMN zone VARCHAR(50)"))
                # Índices para performance (200 pedidos / día)
                try:
                    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_orders_table ON orders(table_number)"))
                    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_orders_status ON orders(status)"))
                    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_orders_created ON orders(created_at)"))
                except Exception:
                    pass  # SQLite vieja puede no soportar IF NOT EXISTS en CREATE INDEX
        except Exception as e:
            print(f"[autoseed] no se pudo migrar kitchen schema: {e}")

        # 1c-tris) Seed 8 estaciones de cocina del rancho
        try:
            from app.models.kitchen import KitchenStation, StationKey
            db_seed = SessionLocal()
            try:
                stations_seed = [
                    (StationKey.neveras,       "Neveras / Alistamiento", "#0ea5e9", 30, 1),
                    (StationKey.parrilla,      "Parrilla",               "#ef4444", 12, 2),
                    (StationKey.sudados,       "Sudados",                "#f59e0b", 8,  3),
                    (StationKey.fritos,        "Fritos",                 "#fbbf24", 10, 4),
                    (StationKey.emplatamiento, "Emplatamiento",          "#d4af37", 20, 5),
                    (StationKey.entradas,      "Entradas",               "#84cc16", 15, 6),
                    (StationKey.sopas,         "Sopas",                  "#a855f7", 10, 7),
                    (StationKey.barra,         "Barra / Bebidas",        "#06b6d4", 20, 8),
                ]
                for key, name, color, concurrent, order in stations_seed:
                    if not db_seed.query(KitchenStation).filter(KitchenStation.key == key).first():
                        db_seed.add(KitchenStation(
                            key=key, display_name=name, color=color,
                            max_concurrent=concurrent, sort_order=order, is_active=True,
                        ))
                db_seed.commit()
            finally:
                db_seed.close()
        except Exception as e:
            print(f"[autoseed] no se pudo sembrar estaciones de cocina: {e}")

        # 1c-quad) Mapeo automático de productos a estaciones (Rancho La Kamelia)
        try:
            from app.models.product import Product, Category
            db_seed = SessionLocal()
            try:
                # Diccionario de categoría → (kitchen_section, requires_neveras, prep_minutes)
                category_map = {
                    "Entradas":              ("entradas", False, 12),
                    "Plato Fuerte del Rancho": ("emplatamiento", True, 25),
                    "Pescados y Mariscos":   ("emplatamiento", True, 18),
                    "Sopas del Rancho":      ("sopas", False, 15),
                    "Ensaladas":             ("entradas", False, 8),
                    "Para Acompanar":        ("entradas", False, 6),
                    "Kamelia Kids":          ("emplatamiento", True, 15),
                    "Limonadas y Sodas":     ("barra", False, 4),
                    "Jugos Naturales":       ("barra", False, 4),
                    "Batidos Saludables":    ("barra", False, 5),
                    "Jarras":                ("barra", False, 8),
                    "Bebidas Embotelladas":  ("barra", False, 1),
                    "Cervezas":              ("barra", False, 1),
                    "Licores":               ("barra", False, 1),
                }
                # Mapeo específico de productos al sub-grupo correcto
                # (cuando categoría dice "emplatamiento" hay que decir parrilla/sudados/fritos)
                product_override = {
                    # PARRILLA
                    "Tomahawk Steak": ("parrilla", 45, True),
                    "Parrillada del Rancho": ("parrilla", 35, True),
                    "Filete Mignon": ("parrilla", 30, True),
                    "Lomo al Trapo": ("parrilla", 50, True),
                    "Baby Beef": ("parrilla", 25, True),
                    "T-Bone Steak": ("parrilla", 30, True),
                    "Lomo Saltado": ("parrilla", 22, True),
                    "Tabla Mixta de 3": ("parrilla", 28, True),
                    "Beef Punta": ("parrilla", 25, True),
                    "Churrasco": ("parrilla", 22, True),
                    "Pechuga La Kamelia": ("parrilla", 22, True),
                    "Costillas de Cerdo": ("parrilla", 30, False),
                    "Chuleton de Cerdo": ("parrilla", 25, True),
                    "Hamburguesa al Carbon Kids": ("parrilla", 15, False),
                    "Brochetas Mixtas Kids": ("parrilla", 18, False),
                    "Salmon La Kamelia": ("parrilla", 18, False),
                    "Trucha": ("parrilla", 20, False),
                    # SUDADOS
                    "Sobrebarriga": ("sudados", 12, False),  # ya cocida, calentar
                    "Lengua en Salsa Criolla": ("sudados", 12, False),
                    "Bagre en Salsa": ("sudados", 15, False),
                    "Cazuela de Mariscos": ("sudados", 18, False),
                    "Cazuela de Frijoles": ("sudados", 15, False),
                    # FRITOS
                    "Mojarra Dorada": ("fritos", 18, False),
                    "Langostinos Apanados": ("fritos", 15, False),
                    "Chuleta Valluna": ("fritos", 15, False),
                    "Lomitos de Pollo Apanados Kids": ("fritos", 12, False),
                }
                # Productos que requieren punto de cocción (cortes)
                requires_point = {
                    "Tomahawk Steak", "Lomo al Trapo", "Baby Beef", "Filete Mignon",
                    "T-Bone Steak", "Beef Punta", "Lomo Saltado", "Tabla Mixta de 3",
                    "Pechuga La Kamelia", "Chuleton de Cerdo", "Churrasco",
                }

                # Map categoria → defaults
                cats = {c.name: c for c in db_seed.query(Category).all()}
                for product in db_seed.query(Product).all():
                    cat = next((c for c in cats.values() if c.id == product.category_id), None)
                    if not cat:
                        continue
                    section, neveras, prep = category_map.get(cat.name, ("entradas", False, 10))
                    if product.name in product_override:
                        section, prep, neveras = product_override[product.name]
                    product.kitchen_section = section
                    product.requires_neveras = neveras
                    product.preparation_time_min = prep
                    product.requires_cooking_point = product.name in requires_point
                db_seed.commit()
            finally:
                db_seed.close()
        except Exception as e:
            print(f"[autoseed] no se pudo mapear productos a estaciones: {e}")

        # 1d) Seed básico de adiciones rápidas si la tabla está vacía
        try:
            from app.models.product import Addon
            db_seed = SessionLocal()
            try:
                if db_seed.query(Addon).count() == 0:
                    defaults = [
                        ("🧀 Doble queso", 3500, "🧀", 1),
                        ("🥓 Tocineta extra", 4000, "🥓", 2),
                        ("🌶️ Doble jalapeños", 1500, "🌶️", 3),
                        ("🍳 Huevo", 2500, "🍳", 4),
                        ("🥩 Doble carne", 6000, "🥩", 5),
                        ("🥑 Aguacate", 3000, "🥑", 6),
                        ("🧅 Cebolla caramelizada", 2000, "🧅", 7),
                        ("🍟 Papas extra", 5000, "🍟", 8),
                    ]
                    for name, price, icon, order in defaults:
                        db_seed.add(Addon(
                            name=name, additional_price=price,
                            icon=icon, sort_order=order, is_active=True,
                        ))
                    db_seed.commit()
            finally:
                db_seed.close()
        except Exception as e:
            print(f"[autoseed] no se pudo sembrar addons: {e}")

        # 1e) Seed: categoría "Domicilios" para Bloque 3
        try:
            from app.models.expense import ExpenseCategory
            db_seed = SessionLocal()
            try:
                if not db_seed.query(ExpenseCategory).filter(ExpenseCategory.name == "Domicilios").first():
                    db_seed.add(ExpenseCategory(
                        name="Domicilios",
                        description="Pagos a repartidores (generado automáticamente desde pedidos con envío gestionado)",
                        is_active=True,
                    ))
                    db_seed.commit()
            finally:
                db_seed.close()
        except Exception as e:
            print(f"[autoseed] no se pudo crear categoría Domicilios: {e}")

        # 2) Rol Mesero + usuario
        db = SessionLocal()
        try:
            r = db.query(Role).filter(Role.name == "Mesero").first()
            if not r:
                r = Role(name="Mesero", description="Toma de pedidos en mesa")
                db.add(r)
                db.flush()
                if not db.query(User).filter(User.email == branding.waiter_email()).first():
                    db.add(User(
                        name="Mesero",
                        email=branding.waiter_email(),
                        hashed_password=get_password_hash("CambiaEstaClave123"),
                        role_id=r.id,
                    ))
                db.commit()
        finally:
            db.close()
    except Exception as e:
        print(f"[autoseed] aviso: {e}")


@app.websocket("/ws/kitchen")
async def kitchen_ws(websocket: WebSocket):
    """
    WebSocket para pantallas de cocina. Mantiene la conexión viva.
    El servidor empuja eventos `order_created`, `order_status_changed`, `order_paid`
    desde order_service._broadcast_kitchen_event al crearse/actualizarse pedidos.
    """
    await kitchen_manager.connect(websocket)
    try:
        while True:
            # Escucha pings del cliente (no es obligatorio que envíe nada)
            await websocket.receive_text()
    except WebSocketDisconnect:
        kitchen_manager.disconnect(websocket)
    except Exception:
        kitchen_manager.disconnect(websocket)


@app.websocket("/ws/system")
async def system_ws(websocket: WebSocket):
    """Real-time system events: order_created, order_paid, inventory_updated, etc."""
    await system_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        system_manager.disconnect(websocket)


# ─── WebSocket por estación (Rancho La Kamelia) ────────────────────────
@app.websocket("/ws/station/{station_key}")
async def station_ws(websocket: WebSocket, station_key: str):
    """
    Canal por estación de cocina: neveras, parrilla, sudados, fritos,
    emplatamiento, entradas, sopas, barra.
    """
    from app.websocket.stations import station_manager
    await station_manager.connect(station_key, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await station_manager.disconnect(station_key, websocket)
    except Exception:
        await station_manager.disconnect(station_key, websocket)


@app.websocket("/ws/dispatch/{queue_type}")
async def dispatch_ws(websocket: WebSocket, queue_type: str):
    """Canal por cola de despacho: principal, entradas, sopas, bebidas."""
    from app.websocket.stations import dispatch_manager
    await dispatch_manager.connect(queue_type, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await dispatch_manager.disconnect(queue_type, websocket)
    except Exception:
        await dispatch_manager.disconnect(queue_type, websocket)


@app.get("/health")
def health():
    """Healthcheck simple — siempre responde si el proceso está vivo."""
    return {"status": "ok", "service": f"{branding.business_name()} API"}


@app.get("/health/deep")
def health_deep():
    """
    Healthcheck profundo: valida DB, scheduler y tablas críticas.
    Útil para load balancers, monitoreo externo, alarmas.
    """
    checks = {"status": "ok", "checks": {}}
    overall_ok = True

    # DB
    try:
        from sqlalchemy import text
        from app.db.session import SessionLocal
        db = SessionLocal()
        try:
            db.execute(text("SELECT 1"))
            checks["checks"]["database"] = {"ok": True}
        finally:
            db.close()
    except Exception as e:
        overall_ok = False
        checks["checks"]["database"] = {"ok": False, "error": str(e)[:200]}

    # Tablas críticas (post-migración)
    try:
        from sqlalchemy import inspect
        from app.db.session import engine
        insp = inspect(engine)
        tables = set(insp.get_table_names())
        required = {"orders", "payments", "products", "users",
                    "addons", "payment_splits", "daily_summaries"}
        missing = required - tables
        if missing:
            overall_ok = False
            checks["checks"]["schema"] = {"ok": False, "missing_tables": sorted(missing)}
        else:
            checks["checks"]["schema"] = {"ok": True, "tables": len(tables)}
    except Exception as e:
        overall_ok = False
        checks["checks"]["schema"] = {"ok": False, "error": str(e)[:200]}

    # Scheduler
    try:
        from app.services import scheduler as sch
        running = sch._scheduler is not None and sch._scheduler.running
        if not running:
            overall_ok = False
        checks["checks"]["scheduler"] = {"ok": running}
    except Exception as e:
        checks["checks"]["scheduler"] = {"ok": False, "error": str(e)[:200]}

    if not overall_ok:
        checks["status"] = "degraded"
        return JSONResponse(status_code=503, content=checks)
    return checks
