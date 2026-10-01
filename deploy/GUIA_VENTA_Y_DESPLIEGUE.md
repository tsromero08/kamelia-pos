# Guía de Venta y Despliegue Seguro — Pecado Burger POS

## El modelo correcto para vender software

### ❌ Lo que NO debes hacer
Instalar el programa en el PC del cliente.
- Pueden copiar los archivos
- Pueden acceder a la base de datos
- Pueden desinstalar y usar sin pagar
- No puedes cobrar mantenimiento
- No tienes control

### ✅ Lo que SÍ debes hacer: Modelo SaaS
El sistema vive en un servidor que TÚ controlas.
El cliente solo usa un navegador web.

---

## Arquitectura de seguridad

```
[PC del cliente — Chrome/Firefox]
         │
         │ HTTPS (cifrado TLS 1.3)
         ▼
[VPS en la nube — TÚ lo controlas]
  ├── Nginx (firewall web, rate limiting)
  ├── Docker: Frontend React
  ├── Docker: Backend FastAPI
  └── Docker: PostgreSQL (NUNCA expuesto al exterior)
         │
         │ SSH con llave privada (solo tú)
         ▼
[Tú — mantenimiento remoto]
```

---

## Precios sugeridos de venta

| Plan | Precio | Qué incluye |
|------|--------|-------------|
| Instalación | $500.000 COP | Setup inicial, capacitación 2h |
| Mensualidad | $150.000 COP/mes | Hosting, soporte, actualizaciones |
| Soporte urgente | $80.000 COP/hora | Intervención fuera de horario |

**Estructura de costos:**
- VPS DigitalOcean: ~$28.000 COP/mes (6 USD)
- Dominio: ~$45.000 COP/año
- Tu margen: ~$120.000 COP/mes por cliente

Con 10 clientes = $1.200.000 COP/mes de ingresos recurrentes.

---

## Paso a paso para vender a un cliente nuevo

### Paso 1: Comprar el VPS
1. Ve a digitalocean.com → crear cuenta
2. Crear Droplet → Ubuntu 22.04 → $6/mes (básico)
3. Guardar la IP del servidor

### Paso 2: Configurar dominio
1. Tener un dominio tuyo (ej: pecadopos.co)
2. Crear subdominio: `cliente1.pecadopos.co` → apunta a la IP del VPS
3. Esperar 5-10 min para que el DNS propague

### Paso 3: Construir imágenes Docker del sistema
```bash
# En tu máquina, en la carpeta del proyecto:
docker build -f backend/Dockerfile.prod -t pecado-backend:latest ./backend
docker build -f frontend/Dockerfile.prod -t pecado-frontend:latest ./frontend

# Exportar imágenes
docker save pecado-backend:latest | gzip > pecado-backend.tar.gz
docker save pecado-frontend:latest | gzip > pecado-frontend.tar.gz

# Subir al servidor
scp pecado-backend.tar.gz root@IP_SERVIDOR:/opt/
scp pecado-frontend.tar.gz root@IP_SERVIDOR:/opt/
```

### Paso 4: Ejecutar el script de instalación en el VPS
```bash
# Conectarte al servidor
ssh root@IP_SERVIDOR

# Cargar imágenes Docker
docker load < /opt/pecado-backend.tar.gz
docker load < /opt/pecado-frontend.tar.gz

# Ejecutar instalación segura
bash setup_vps_seguro.sh nombre_cliente cliente1.pecadopos.co
```

### Paso 5: Entregar al cliente
- URL: `https://cliente1.pecadopos.co`
- Usuario: `admin@cliente1.pecadopos.co`
- Contraseña: (la que generó el script)
- Manual de usuario (PDF)

---

## Medidas de seguridad implementadas

### Capa 1: Red
- ✅ **HTTPS obligatorio** — TLS 1.3, certificado Let's Encrypt gratuito
- ✅ **Firewall UFW** — solo puertos 22, 80, 443 abiertos
- ✅ **Base de datos NUNCA expuesta** — solo acceso desde contenedor interno
- ✅ **Redis/API interna** — red Docker privada

### Capa 2: Aplicación
- ✅ **JWT con expiración** — tokens rotan cada 8 horas
- ✅ **Rate limiting en login** — máximo 5 intentos por minuto por IP
- ✅ **Rate limiting general** — 30 req/s por IP
- ✅ **Contraseñas con bcrypt** — imposible revertir
- ✅ **Headers de seguridad** — X-Frame-Options, CSP, HSTS, etc.
- ✅ **Auditoría completa** — cada acción queda registrada con usuario y hora

### Capa 3: Servidor
- ✅ **SSH solo con llave privada** — sin contraseña, sin acceso por defecto
- ✅ **Fail2Ban** — banea IPs que intentan fuerza bruta
- ✅ **Nginx oculta versión** — no revela información del servidor
- ✅ **Actualizaciones automáticas** — `unattended-upgrades`

### Capa 4: Datos
- ✅ **Backups cifrados AES-256** — diarios a las 2am
- ✅ **Solo tú tienes la llave de descifrado**
- ✅ **Retención 30 días**

---

## Cómo haces mantenimiento (acceso exclusivo)

```bash
# Conectarte al servidor del cliente
ssh -i ~/.ssh/tu_llave_privada root@IP_SERVIDOR_CLIENTE

# Ver logs del sistema
docker logs pecado-backend --tail=100

# Reiniciar el sistema
docker compose restart

# Hacer backup manual
/opt/pecado-pos-cliente/backup.sh

# Ver base de datos (solo para emergencias)
docker exec -it $(docker ps -qf "name=db") psql -U pecado_user pecado_burger
```

### Actualizar el sistema con nueva versión
```bash
# En tu máquina: construir nueva versión
docker build -f backend/Dockerfile.prod -t pecado-backend:v2 ./backend
docker save pecado-backend:v2 | gzip | ssh root@IP_CLIENTE "docker load"

# En el servidor del cliente:
docker compose pull
docker compose up -d --no-deps backend
```

---

## Contrato de servicio recomendado

Incluir en el contrato:
1. El software es propiedad intelectual tuya — el cliente tiene licencia de uso
2. El cliente NO tiene acceso al código fuente ni a la base de datos directamente
3. Tú eres el único responsable del mantenimiento y actualizaciones
4. El servicio puede suspenderse si el cliente no paga
5. Los datos del cliente son confidenciales y no se comparten con terceros
6. Backup incluido — garantía de disponibilidad del 99%

---

## Si el cliente insiste en instalación local (no recomendado)

Si por alguna razón necesitas instalar en el PC del cliente:

1. **Obfuscar el código Python** con PyArmor
2. **Licencia por MAC address** — el sistema no arranca en otro PC
3. **VPN para mantenimiento** — WireGuard o Tailscale
4. **Base de datos cifrada** — PostgreSQL con `pgcrypto`
5. **Contrato que prohíbe** copiar/redistribuir el software

```bash
# Instalar PyArmor para proteger código Python
pip install pyarmor
pyarmor gen --recursive app/

# Licencia por MAC
pyarmor gen --bind-device "eth0:AA:BB:CC:DD:EE:FF" app/
```

---

## Lista de verificación antes de entregar a un cliente

- [ ] VPS creado y dominio configurado
- [ ] Script de instalación ejecutado exitosamente
- [ ] HTTPS funcionando (candado verde en navegador)
- [ ] Login con usuario admin funciona
- [ ] Productos del cliente cargados en el sistema
- [ ] Categorías e imágenes configuradas
- [ ] Usuario cajero creado para el empleado
- [ ] Usuario cocina creado (sin acceso a reportes/admin)
- [ ] Backup automático configurado y probado
- [ ] Contrato firmado
- [ ] Pago recibido
- [ ] Capacitación realizada
- [ ] Manual de usuario entregado
