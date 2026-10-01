# Changelog

## [1.2.0] — 2026-05-14

### Bloque 1 · Login y Seguridad
- **Login**: campo de contraseña con toggle ojo (`Eye`/`EyeOff`)
- **Permisos por rol**: las páginas admin están bloqueadas en `App.tsx`
  vía `RoleGuard roles={['Administrador']}`; el backend usa `get_admin`
  como segunda barrera
- **Código de Acceso Especial** para acciones críticas:
  - Configurable en `settings.SPECIAL_ACCESS_CODE` (default desde `restaurant.config.json`)
  - Endpoint `POST /api/v1/auth/verify-special-code`
  - Modal `SpecialCodeModal` aplicado en:
    - Inventario (crear insumo, ajustar stock)
    - Gastos (crear, eliminar)
    - Cierre Diario (cerrar manualmente)
  - Rate limit específico: 5 intentos/min (anti brute-force)
  - El código se puede cambiar desde la UI: **Usuarios → Cambiar código de acceso**
  - Cambio persistido en `backend/data/system_settings.json`
  - Toda verificación (exitosa o fallida) queda en `AuditLog`

### Bloque 2 · Adiciones rápidas + Cortesía
- **Nueva tabla** `addons(id, name, additional_price, inventory_item_id?, inventory_quantity, icon, is_active, sort_order)`
- **Seed inicial** de 8 adiciones: doble queso, tocineta, jalapeños, huevo,
  doble carne, aguacate, cebolla caramelizada, papas extra
- **Endpoints** `GET/POST/PUT/DELETE /api/v1/products/addons`
- **Página admin** `/admin/addons` con CRUD completo
- **POS**: las adiciones aparecen como chips toggleables en el modal de producto
- **Cortesía**: columna `orders.is_courtesy` (default false)
  - Cuando true, `order.total = 0` (subtotal mantiene precio de referencia)
  - Inventario se descuenta normal (al cobrar con `method='courtesy', amount=0`)
  - Si se combina con `delivery_managed`, se permite pero queda log en AuditLog

### Bloque 3 · Domicilios con conciliación contable
- **Enum** `DeliveryMode = none | external | managed`
- **Columnas** `orders.delivery_mode`, `orders.delivery_fee`
- **Validaciones**:
  - `managed` requiere `delivery_fee > 0`
  - `external` debe tener `delivery_fee = 0`
  - `delivery_mode != none` solo aplica a `order_type=delivery`
- **Conciliación automática**: al cobrar un pedido con `delivery_mode=managed`,
  `process_payment` crea automáticamente un `Expense` en la categoría
  "Domicilios" por el valor del envío
- La categoría se siembra automáticamente al arrancar si no existe

### Bloque 4 · Split Payment + Nequi/Daviplata + Fiscalidad
- **Enum extendido**: `PaymentMethod += nequi, daviplata, courtesy, mixed`
- **Nueva tabla** `payment_splits(payment_id, payment_method, amount, reference)`
- **Pago dividido**:
  - `payments.is_split = true` cuando hay 2+ métodos
  - `payment_method = 'mixed'` (forzado)
  - El backend valida que la suma de splits == amount
- **POS**: switch "Un solo método / Pago dividido" en el modal de cobro,
  hasta 5 splits, validación visual de la suma
- **Datos fiscales por orden**:
  - `customer_type` (natural/jurídica)
  - `tax_type` (Régimen Simple, Responsable IVA, etc.)
  - `tax_id` (NIT o cédula)
- **Factura impresa** muestra todos los nuevos campos: cortesía, envío,
  datos fiscales del cliente, desglose del pago dividido

### Bloque 5 · Cierre automático de caja
- **APScheduler** con `CronTrigger(hour=23, minute=59, timezone=Colombia)`
- Llama a `financial_service.close_day()` que consolida en `daily_summaries`
- **Catch-up al arrancar**: cierra los últimos 7 días que no estén cerrados
- Idempotente: si ya existe `daily_summary` para esa fecha, hace upsert
- **Endpoint** `GET /api/v1/reports/scheduler-status` expone:
  - `running`, `next_run`, `today_closed`, `pending_days`, `last_closure`
- **Badge en Dashboard** muestra el estado en vivo

### Mejoras transversales
- **Dashboard**: tarjetas para "Cortesías hoy" y "Pagado a repartidores (mes)"
- **Caja**: filtro por método de pago en tab Facturas, badges visuales
  (CORTESÍA, 🛵 ENVÍO, ⊟ DIVIDIDO, NIT), desglose del split
- **AuditLog** ampliado: `verify_special_code`, `change_special_code`,
  `courtesy_with_managed_delivery`
- **Migración Alembic** `002_blocks_234.py` para entornos estrictos
- **Tests pytest**: 20 tests cubren los 5 bloques (`backend/tests/`)
- **`env.example`** con todas las variables documentadas
- **`AdminOnly`** componente helper para gating de UI (no hace falta en la
  mayoría de páginas porque RoleGuard ya bloquea las rutas admin)

### Reglas respetadas
- ✅ Ninguna lógica existente fue eliminada
- ✅ Todos los cambios son extensión (nuevas columnas, nuevas tablas, nuevos endpoints)
- ✅ La BD se migra automáticamente al arrancar (autoseed soft), funciona
  con SQLite y PostgreSQL sin pasos manuales

---

## [1.1.0] — 2026-04-19

Versión inicial estable (sistema POS, inventario, cocina, finanzas).
Ver el README para detalles.
