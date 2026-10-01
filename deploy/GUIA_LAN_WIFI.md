# Despliegue LAN — Rancho La Kamelia (WiFi sin internet)

Este documento explica cómo dejar el sistema corriendo en el rancho de modo que **TODO funcione vía WiFi local sin necesidad de internet**.

---

## 1. Hardware mínimo recomendado

| Pieza | Mínimo | Recomendado |
|---|---|---|
| Servidor (mini-PC) | Intel N100 / 8 GB RAM / 256 GB SSD | i3-12va / 16 GB RAM / 512 GB SSD |
| UPS (corriente de respaldo) | 600 VA / 10 min | **obligatoria** — 1200 VA / 30 min |
| Router | WiFi 6, 2 SSID (clientes + caja) | Empresarial Mikrotik / Ubiquiti |
| Access Points | 1 | 2-3 (capilla, salón, picadero) |
| Impresoras térmicas Ethernet | 1 cocina | Una por estación (Epson TM-T20III) |
| Tablets / celulares meseros | 4 | 6-10 |
| USB externo (backups) | 64 GB | 256 GB + segundo USB |

---

## 2. Setup del servidor (UNA sola vez, con internet)

En el mini-PC con Ubuntu 22.04 limpio:

```bash
git clone <repo-url> /opt/kamelia
cd /opt/kamelia
chmod +x deploy/setup_lan.sh
./deploy/setup_lan.sh
```

El script instala Docker, ufw firewall, mDNS (`kamelia.local`), genera certificados HTTPS locales con `mkcert` y configura el hostname.

---

## 3. Configurar IP fija en el router

En la administración del router del rancho:

1. Reserva una IP fija (ej. `192.168.1.50`) al MAC del mini-PC.
2. En "DHCP Reservations" / "Static DHCP": MAC del servidor → `192.168.1.50`.
3. Reinicia el servidor para que tome la IP fija.

Verifica:
```bash
hostname -I    # debe responder 192.168.1.50
```

---

## 4. Levantar el sistema

```bash
cd /opt/kamelia
docker compose -f docker-compose.lan.yml up -d --build
```

Espera 3-4 minutos. Verifica:
```bash
docker ps                                # 4 contenedores corriendo (db, backend, frontend, backup)
curl -k https://kamelia.local/health     # debe responder {"status":"ok"}
```

---

## 5. Cargar el menú inicial (115 productos)

```bash
docker exec -it kamelia_backend python -m app.db.seed_products
```

---

## 6. Instalar certificado raíz en cada dispositivo

Para que los celulares no muestren "Sitio no seguro":

1. Copia el archivo `$(mkcert -CAROOT)/rootCA.pem` a un USB.
2. En **Android**: Ajustes → Seguridad → Cifrado y credenciales → Instalar desde almacenamiento → CA Certificate.
3. En **iOS/iPad**: envía el `.pem` por AirDrop / Mail interno → Ajustes → General → Acerca → Ajustes de certificados de confianza → activar mkcert.
4. En **PC Windows**: doble click → Instalar certificado → Equipo local → Entidades de certificación raíz de confianza.

Ahora abre desde cualquier dispositivo: **https://kamelia.local**

---

## 7. Instalar como PWA en celulares de meseros

1. Abre `https://kamelia.local` en Chrome/Safari.
2. Menú → "Agregar a pantalla de inicio" / "Instalar app".
3. El ícono del caballo dorado aparece como cualquier app nativa.
4. **Funciona offline**: si el WiFi parpadea, los pedidos se guardan y se envían solos al recuperar.

---

## 8. Backups automáticos

- Se generan **cada hora** en `/opt/kamelia/backups/kamelia_YYYYMMDD_HHMMSS.sql.gz`.
- Se conservan los últimos **7 días** (rotación automática).
- Para máxima seguridad, monta un USB:
  ```bash
  sudo mkdir -p /var/kamelia/backups
  sudo mount /dev/sdb1 /var/kamelia/backups
  # editar docker-compose.lan.yml → ./backups → /var/kamelia/backups
  ```

Restaurar:
```bash
./deploy/restore_backup.sh                              # último backup
./deploy/restore_backup.sh backups/kamelia_20260518_120000.sql.gz   # específico
```

---

## 9. Monitorización ("todo verde")

- `https://kamelia.local/health/deep` → JSON con estado de DB, scheduler, esquema.
- `docker logs -f kamelia_backend` → logs en tiempo real.
- `docker stats` → uso CPU/RAM por contenedor.

Si algo falla, recargar:
```bash
docker compose -f docker-compose.lan.yml restart backend
```

---

## 10. Acceso desde toda la red

Una vez todo arriba:

| Quién | URL |
|---|---|
| Meseros con celular | `https://kamelia.local` → instalar como PWA |
| Pantalla cocina parrilla | `https://kamelia.local/admin/cocina/parrilla` |
| Pantalla cocina sudados | `https://kamelia.local/admin/cocina/sudados` |
| Pantalla cocina fritos | `https://kamelia.local/admin/cocina/fritos` |
| Pantalla emplatamiento | `https://kamelia.local/admin/cocina/emplatamiento` |
| Pantalla neveras | `https://kamelia.local/admin/cocina/neveras` |
| Pantalla entradas | `https://kamelia.local/admin/cocina/entradas` |
| Pantalla sopas | `https://kamelia.local/admin/cocina/sopas` |
| Pantalla barra | `https://kamelia.local/admin/cocina/barra` |
| Despacho principal | `https://kamelia.local/admin/despacho/principal` |
| Despacho entradas/sopas/bebidas | `https://kamelia.local/admin/despacho/{entradas\|sopas\|bebidas}` |
| Caja | `https://kamelia.local/admin/caja` |
| Admin (dueño) | `https://kamelia.local/admin/dashboard` |

---

## 11. Sin internet: lo que SÍ funciona

- ✅ Tomar pedidos desde celulares de meseros
- ✅ Pantallas de cocina en tiempo real (WebSockets en LAN)
- ✅ Despachos con asignación automática
- ✅ Pago y facturación
- ✅ Reportes y dashboard
- ✅ Backups automáticos al disco/USB local
- ✅ PWA instalada en celulares (caché del menú + cola offline)

## 12. Lo que NO funciona sin internet (y no hace falta)

- ❌ Envío de SMS / WhatsApp automático (si se quiere agregar, requiere internet)
- ❌ Pasarelas de pago en línea (PSE / tarjeta vía gateway)
- ❌ Actualización del software (se hace en visitas con internet)

---

## 13. En caso de apagón

- La UPS mantiene servidor + router 10-30 minutos.
- Si dura más, todos los celulares tienen el menú cacheado y siguen mostrando lo que tenían.
- Los pedidos hechos durante el apagón se guardan en cada celular (IndexedDB) y se sincronizan automáticamente cuando vuelve la luz.
