# Sistema POS para Restaurantes — Plantilla Base

Sistema completo de gestión (POS, inventario, cocina, finanzas) listo para
ser personalizado y vendido a cualquier tipo de restaurante.

> **Idea**: editas un solo archivo (`restaurant.config.json`), corres un
> script (`personalizar.py`) y el sistema queda con el nombre, NIT, dominio
> y datos del cliente. La carta y el inventario los cargas desde el panel
> o un CSV.

## Stack

- **Backend**: Python 3.11, FastAPI, SQLAlchemy, PostgreSQL (o SQLite), Alembic, JWT
- **Frontend**: React 18, TypeScript, Tailwind CSS, Zustand, React Query, Recharts
- **Tiempo real**: WebSockets (cocina, dashboard)
- **Infraestructura**: Docker, docker-compose

---

## Crear el sistema para un cliente nuevo (3 pasos)

### 1) Personalizar marca
```bash
python personalizar.py
```
Wizard interactivo. Pregunta nombre, NIT, teléfono, dirección, dominio.
Reescribe `restaurant.config.json`, `.env`, `frontend/index.html` y los
defaults del frontend. Genera un `SECRET_KEY` aleatorio la primera vez.

### 2) Levantar el sistema
**Windows (recomendado)**: doble click en `INSTALAR.bat`
**Manual**:
```bash
docker compose up --build
```
Espera 2-3 minutos. Abre http://localhost:3000 (dev) o http://localhost (prod).

### 3) Cargar carta e inventario
- **Desde el panel**: ingresa con `admin@<dominio>` / `CambiaEstaClave123` (cambia
  la clave inmediatamente) y usa **Productos**, **Inventario**, **Recetas**.
- **Por CSV** (más rápido para cargas iniciales grandes): edita
  `backend/data/{inventario,productos,recetas}.csv` y corre:
  ```bash
  cd backend
  python -m app.db.seed_products
  ```

¡Eso es todo!

---

## Estructura del proyecto

```
base/
├── restaurant.config.json      # ← edita aquí los datos del cliente
├── personalizar.py             # ← wizard de configuración
├── GUIA_NUEVO_CLIENTE.md       # guía paso-a-paso para vender e instalar
├── backend/
│   ├── app/
│   │   ├── api/v1/endpoints/   # Rutas REST por módulo
│   │   ├── core/
│   │   │   ├── branding.py     # ← carga restaurant.config.json
│   │   │   ├── config.py       # settings JWT/DB/etc.
│   │   │   └── security.py
│   │   ├── db/
│   │   │   ├── seed.py             # roles + usuarios + unidades (mínimo)
│   │   │   └── seed_products.py    # carga CSV opcional
│   │   ├── models/             # SQLAlchemy ORM
│   │   ├── schemas/            # Pydantic
│   │   ├── services/           # lógica de negocio
│   │   └── websocket/
│   ├── data/                   # CSV plantilla (inventario/productos/recetas)
│   ├── alembic/                # migraciones
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── config/branding.ts  # ← constantes inyectadas por personalizar.py
│       ├── pages/              # Dashboard, POS, Cocina, etc.
│       ├── components/
│       ├── services/api.ts
│       └── store/
├── deploy/
│   ├── GUIA_VENTA_Y_DESPLIEGUE.md
│   └── setup_vps_seguro.sh     # configura VPS (Ubuntu) + Docker + HTTPS
├── docker-compose.yml          # dev
├── docker-compose.prod.yml     # prod (un solo puerto: 80)
├── INSTALAR.bat / iniciar.bat / APAGAR.bat / BACKUP.bat
└── nginx/
```

---

## Módulos del sistema

| Módulo | Descripción |
|--------|-------------|
| **POS / Caja** | Tomar pedidos, elegir variante (sola/combo), pagar |
| **Cocina** | Pantalla en tiempo real con estados, temporizador, alertas |
| **Productos** | CRUD con variantes, opciones, combos, imágenes |
| **Inventario** | Stock, movimientos, kardex, lotes con vencimiento |
| **Recetas** | Vincular variantes con insumos exactos (descuento automático) |
| **Compras** | Registro → actualiza stock y costo |
| **Gastos** | Por categoría |
| **Pérdidas** | Mermas, daños, desperdicios |
| **Clientes** | Base con historial e info fiscal |
| **Reportes** | Ventas por producto, método de pago, exportables PDF/Excel |
| **Financiero** | Utilidad, margen, comparativa mensual |
| **Dashboard** | Métricas día/mes, tendencias, gráficos |
| **Turnos de caja** | Apertura/cierre con conciliación |
| **Cierre automático** | Scheduler a las 23:59 (consolidación diaria) |
| **Usuarios** | Roles: Administrador, Cajero, Cocina, Mesero |

### Funcionalidades destacadas
- **Pago dividido**: hasta 5 métodos por factura (efectivo, tarjeta, Nequi, Daviplata, transferencia)
- **Domicilios** con conciliación contable (gasto automático al repartidor)
- **Cortesía** con descuento de inventario pero total $0
- **Datos fiscales** por orden (Natural/Jurídica, NIT, régimen)
- **Código de Acceso Especial** para acciones críticas (inventario, gastos, cierres)
- **Notificaciones** de stock bajo en tiempo real
- **Auditoría** completa (quién hizo qué y cuándo)

---

## Flujo de una venta

1. Cajero abre POS → selecciona productos
2. Elige variante (sola / combo)
3. Selecciona opciones (ej. proteína: pollo / carne / mixto)
4. Agrega adiciones o quita ingredientes
5. Confirma → sistema calcula total
6. Registra pago (1 o varios métodos)
7. **Automáticamente**: descuenta inventario según receta
8. Pedido aparece en cocina en tiempo real
9. Cocina: Recibido → Preparando → Listo → Entregado

---

## Variables de entorno principales

| Variable | Descripción | Default |
|----------|-------------|---------|
| `DATABASE_URL` | Conexión PostgreSQL/SQLite | `sqlite:///./restaurant_pos.db` |
| `SECRET_KEY` | Clave JWT (la genera personalizar.py) | aleatoria |
| `SPECIAL_ACCESS_CODE` | Código para acciones críticas | de `restaurant.config.json` |
| `BLOCK_SALE_ON_LOW_STOCK` | Bloquea venta si stock crítico | `false` |
| `DEBUG` | En `false` oculta `/docs` | `false` |
| `BRAND_BUSINESS_NAME` | Override del nombre (gana sobre JSON) | — |

Ver `backend/env.example` para la lista completa.

---

## Tests

```bash
cd backend
venv\Scripts\pytest tests/ -v
```

---

## Migraciones

Hay dos mecanismos:
1. **Autoseed soft** al arrancar (`app/main.py`): ejecuta ALTER TABLE
   idempotentes — funciona en SQLite y PostgreSQL sin pasos manuales.
2. **Alembic** para entornos estrictos: `alembic upgrade head`.

---

## Para vender el sistema

Ver `GUIA_NUEVO_CLIENTE.md` (raíz) con el procedimiento completo:
recolección de datos → personalización → demo local → despliegue VPS →
entrega de credenciales y backups.

Ver `deploy/GUIA_VENTA_Y_DESPLIEGUE.md` para el detalle del despliegue
SaaS en DigitalOcean / cualquier VPS Ubuntu.

---

## Notas de producción

1. `personalizar.py` genera un `SECRET_KEY` de 64 chars aleatorios la primera vez.
2. Cambiar la contraseña del admin desde la UI antes de entregar al cliente.
3. Usar HTTPS con el script `deploy/setup_vps_seguro.sh` (Let's Encrypt + UFW + Fail2Ban).
4. `BACKUP.bat` (o cron en VPS) crea backups cifrados diarios.
5. La base de datos **nunca** se expone al exterior — solo el frontend en 80/443.
