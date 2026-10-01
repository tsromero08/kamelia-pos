# Plantillas de carga inicial

Edita estos CSV con la carta y el inventario del cliente.
Luego, dentro del backend:

```bash
python -m app.db.seed_products
```

El script es **idempotente**: si un producto o insumo ya existe (mismo
nombre), no lo duplica. Puedes correrlo varias veces para agregar
productos nuevos.

## Archivos

### `inventario.csv`
Los insumos crudos (pan, carne, gaseosas, etc.).
| Columna | Descripción |
|---------|-------------|
| `nombre` | Nombre único del insumo |
| `unidad` | Una de: Gramos, Unidades, Mililitros, Litros, Porciones, Kilogramos |
| `stock` | Stock inicial |
| `min_stock` | Umbral para alerta de stock bajo |
| `costo` | Costo unitario |

### `productos.csv`
Los productos vendibles, agrupados por categoría. Un producto puede tener
varias variantes (ej: Sola / Combo).

| Columna | Descripción |
|---------|-------------|
| `categoria` | Nombre de la categoría (se crea si no existe) |
| `producto` | Nombre del producto |
| `variante` | Nombre de la variante (Sola, Combo, Mediana, Grande, etc.) |
| `precio` | Precio de venta de esa variante |
| `tipo` | `plate`, `burger`, `drink`, `dessert`, etc. (mira `ProductType`) |
| `combo` | `true` si esa variante es combo (incluye papas/bebida) |
| `imagen` | Ruta opcional, ej: `/images/pizza.jpg` |

### `recetas.csv`
Qué insumos descuenta cada variante (es lo que conecta inventario y POS).

| Columna | Descripción |
|---------|-------------|
| `producto` | Mismo nombre que en `productos.csv` |
| `variante` | Mismo nombre de la variante |
| `insumo` | Nombre del insumo en `inventario.csv` |
| `cantidad` | Cuánto descuenta cada venta (en la unidad del insumo) |

## Ejemplo: pizzería

```csv
# inventario.csv
Masa pizza mediana,Unidades,80,15,2500
Queso mozzarella,Gramos,5000,500,35
Salsa tomate,Mililitros,3000,500,12

# productos.csv
Pizzas,Margherita,Mediana,28000,plate,false,
Pizzas,Margherita,Familiar,38000,plate,false,

# recetas.csv
Margherita,Mediana,Masa pizza mediana,1
Margherita,Mediana,Queso mozzarella,150
Margherita,Mediana,Salsa tomate,80
```

## Después de cargar

Cuando termines la carga inicial, **la mejor práctica es** agregar el
resto desde el panel admin (`/admin/products`, `/admin/inventory`). El
CSV es para el bulk inicial.
