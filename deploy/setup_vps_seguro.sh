#!/bin/bash
# =============================================================================
# Script de configuración VPS seguro para Pecado Burger POS
# Ejecutar como root en el servidor VPS del cliente
# Uso: bash setup_vps_seguro.sh <nombre_cliente> <dominio>
# Ejemplo: bash setup_vps_seguro.sh pecado_burger cliente1.midominio.com
# =============================================================================

set -e

CLIENTE=${1:-"cliente"}
DOMINIO=${2:-"localhost"}
DB_PASS=$(openssl rand -hex 32)
SECRET_KEY=$(openssl rand -hex 64)
ADMIN_PASS=$(openssl rand -base64 16)

echo "=============================================="
echo "  Instalando Pecado Burger POS"
echo "  Cliente: $CLIENTE"
echo "  Dominio: $DOMINIO"
echo "=============================================="

# ── 1. Actualizar sistema ──────────────────────────────────────────────────
apt-get update -y && apt-get upgrade -y
apt-get install -y ufw fail2ban certbot python3-certbot-nginx nginx curl git

# ── 2. Instalar Docker ────────────────────────────────────────────────────
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
fi

# ── 3. Firewall — solo puertos necesarios ─────────────────────────────────
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment "SSH - solo admin"
ufw allow 80/tcp comment "HTTP redirect a HTTPS"
ufw allow 443/tcp comment "HTTPS app"
ufw --force enable

# ── 4. Fail2Ban — bloquear fuerza bruta ───────────────────────────────────
cat > /etc/fail2ban/jail.local << EOF
[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 5
destemail = admin@midominio.com

[sshd]
enabled = true
port = 22
maxretry = 3

[nginx-http-auth]
enabled = true

[nginx-limit-req]
enabled = true
filter = nginx-limit-req
action = iptables-multiport[name=nginx-limit-req, port="http,https"]
logpath = /var/log/nginx/error.log
maxretry = 10
EOF
systemctl restart fail2ban

# ── 5. Crear directorio del cliente con permisos restrictivos ─────────────
mkdir -p /opt/pecado-pos-$CLIENTE
chmod 700 /opt/pecado-pos-$CLIENTE
cd /opt/pecado-pos-$CLIENTE

# ── 6. Crear .env con credenciales únicas por cliente ────────────────────
cat > .env << EOF
DATABASE_URL=postgresql://pecado_user:${DB_PASS}@db:5432/pecado_burger
SECRET_KEY=${SECRET_KEY}
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=480
POSTGRES_USER=pecado_user
POSTGRES_PASSWORD=${DB_PASS}
POSTGRES_DB=pecado_burger
FIRST_ADMIN_EMAIL=admin@${DOMINIO}
FIRST_ADMIN_PASSWORD=${ADMIN_PASS}
FIRST_ADMIN_NAME=Administrador
BACKEND_CORS_ORIGINS=["https://${DOMINIO}"]
BLOCK_SALE_ON_LOW_STOCK=false
EOF
chmod 600 .env  # Solo root puede leer las credenciales

# ── 7. Docker Compose ─────────────────────────────────────────────────────
cat > docker-compose.yml << EOF
version: '3.9'

services:
  db:
    image: postgres:16-alpine
    restart: always
    environment:
      POSTGRES_USER: \${POSTGRES_USER}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}
      POSTGRES_DB: \${POSTGRES_DB}
    volumes:
      - db_data:/var/lib/postgresql/data
    networks:
      - internal
    # NO exponer puerto al exterior — solo acceso interno

  backend:
    image: pecado-backend:latest
    restart: always
    env_file: .env
    depends_on:
      - db
    networks:
      - internal
    # NO exponer puerto al exterior

  frontend:
    image: pecado-frontend:latest
    restart: always
    depends_on:
      - backend
    ports:
      - "127.0.0.1:3000:80"  # Solo localhost, Nginx hace el proxy
    networks:
      - internal

volumes:
  db_data:
    driver: local

networks:
  internal:
    driver: bridge
    internal: false
EOF

# ── 8. Nginx con HTTPS y headers de seguridad ─────────────────────────────
cat > /etc/nginx/sites-available/$CLIENTE << EOF
# Redirigir HTTP a HTTPS
server {
    listen 80;
    server_name ${DOMINIO};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${DOMINIO};

    ssl_certificate /etc/letsencrypt/live/${DOMINIO}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMINIO}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;

    # Headers de seguridad
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' wss://${DOMINIO}" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;

    # Ocultar versión de Nginx
    server_tokens off;

    # Rate limiting — máximo 30 req/s por IP
    limit_req_zone \$binary_remote_addr zone=api:10m rate=30r/s;
    limit_req zone=api burst=50 nodelay;

    # Rate limiting más estricto en login
    limit_req_zone \$binary_remote_addr zone=login:10m rate=5r/m;

    location /api/v1/auth/login {
        limit_req zone=login burst=3 nodelay;
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /ws/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
    }

    # Bloquear acceso a archivos sensibles
    location ~ /\.(env|git|htaccess|sql|db) {
        deny all;
        return 404;
    }
}
EOF

ln -sf /etc/nginx/sites-available/$CLIENTE /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# ── 9. Certificado SSL gratuito (Let's Encrypt) ───────────────────────────
certbot --nginx -d $DOMINIO --non-interactive --agree-tos -m admin@midominio.com
systemctl enable certbot.timer

# ── 10. SSH — solo acceso con llave, no contraseña ───────────────────────
cat >> /etc/ssh/sshd_config << EOF

# Seguridad SSH adicional
PasswordAuthentication no
PermitRootLogin prohibit-password
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
EOF
systemctl restart sshd

# ── 11. Backup automático cifrado diario ──────────────────────────────────
cat > /opt/pecado-pos-$CLIENTE/backup.sh << 'BACKUP'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="/opt/backups/pecado_${DATE}.sql.gz.enc"
mkdir -p /opt/backups

# Dump y cifrado con AES-256
docker exec $(docker ps -qf "name=db") pg_dump -U pecado_user pecado_burger | \
  gzip | \
  openssl enc -aes-256-cbc -salt -pass env:BACKUP_KEY -pbkdf2 \
  > $BACKUP_FILE

# Mantener solo últimos 30 días
find /opt/backups -name "*.enc" -mtime +30 -delete
echo "Backup OK: $BACKUP_FILE"
BACKUP

chmod +x /opt/pecado-pos-$CLIENTE/backup.sh

# Programar backup diario a las 2am
echo "0 2 * * * root /opt/pecado-pos-$CLIENTE/backup.sh" >> /etc/crontab

# ── 12. Guardar credenciales de forma segura ─────────────────────────────
echo ""
echo "=============================================="
echo "  INSTALACIÓN COMPLETA - GUARDAR ESTO:"
echo "=============================================="
echo "  URL:        https://$DOMINIO"
echo "  Admin user: admin@$DOMINIO"
echo "  Admin pass: $ADMIN_PASS"
echo "  DB pass:    $DB_PASS (NUNCA compartir)"
echo "  Secret key: ${SECRET_KEY:0:20}... (NUNCA compartir)"
echo "=============================================="
echo "  ESTAS CREDENCIALES NO SE MUESTRAN DE NUEVO"
echo "=============================================="
