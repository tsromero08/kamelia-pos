#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
#  RANCHO LA KAMELIA — Setup servidor LAN (Ubuntu 22.04+)
#  Ejecutar en el mini-PC del rancho UNA SOLA VEZ.
#
#  Requiere internet SOLO durante este setup. Después no necesita.
# ═══════════════════════════════════════════════════════════════════
set -e

echo "═══════════════════════════════════════════"
echo " RANCHO LA KAMELIA — Setup servidor LAN"
echo "═══════════════════════════════════════════"

# 1) Paquetes base
echo ""
echo "→ Instalando Docker + utilidades…"
sudo apt update
sudo apt install -y docker.io docker-compose-plugin ufw avahi-daemon nss-mdns curl wget libnss3-tools

# 2) Activar Docker
sudo systemctl enable --now docker
sudo usermod -aG docker $USER

# 3) Firewall: solo 80, 443, 22 desde la LAN (192.168.0.0/16 y 10.0.0.0/8)
echo ""
echo "→ Configurando firewall…"
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from 192.168.0.0/16 to any port 22 proto tcp
sudo ufw allow from 192.168.0.0/16 to any port 80 proto tcp
sudo ufw allow from 192.168.0.0/16 to any port 443 proto tcp
sudo ufw allow from 10.0.0.0/8 to any port 22 proto tcp
sudo ufw allow from 10.0.0.0/8 to any port 80 proto tcp
sudo ufw allow from 10.0.0.0/8 to any port 443 proto tcp
sudo ufw --force enable

# 4) mDNS — para que `kamelia.local` resuelva sin DNS
echo ""
echo "→ Habilitando mDNS (kamelia.local resolverá en toda la LAN)…"
sudo systemctl enable --now avahi-daemon
sudo hostnamectl set-hostname kamelia

# 5) mkcert para HTTPS local
echo ""
echo "→ Instalando mkcert (HTTPS local sin Let's Encrypt)…"
MKCERT_VERSION="v1.4.4"
wget -q -O /tmp/mkcert "https://github.com/FiloSottile/mkcert/releases/download/${MKCERT_VERSION}/mkcert-${MKCERT_VERSION}-linux-amd64"
chmod +x /tmp/mkcert
sudo mv /tmp/mkcert /usr/local/bin/mkcert
mkcert -install

# 6) Generar certificados para kamelia.local
echo ""
echo "→ Generando certificados para kamelia.local…"
PROJECT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
mkdir -p "${PROJECT_DIR}/certs"
cd "${PROJECT_DIR}/certs"
mkcert kamelia.local rancholakamelia.local localhost 127.0.0.1 ::1

# 7) Detectar IP local del servidor
SERVER_IP=$(hostname -I | awk '{print $1}')
echo ""
echo "═══════════════════════════════════════════"
echo " ✓ Setup completado"
echo "═══════════════════════════════════════════"
echo ""
echo " IP de este servidor: ${SERVER_IP}"
echo " Hostname mDNS      : kamelia.local"
echo ""
echo " SIGUIENTE PASO:"
echo "   1. En el router del rancho, reserva esta IP fija al MAC del servidor."
echo "   2. Desde la raíz del proyecto, levanta los contenedores:"
echo "        docker compose -f docker-compose.lan.yml up -d --build"
echo ""
echo "   3. Para acceder desde cualquier celular/tablet del rancho conectado al WiFi:"
echo "        https://kamelia.local"
echo "        o:  https://${SERVER_IP}"
echo ""
echo "   4. Instala el certificado raíz mkcert en cada dispositivo cliente:"
echo "        ubicación:  $(mkcert -CAROOT)/rootCA.pem"
echo "        envíalo por AirDrop / Bluetooth / WhatsApp local"
echo ""
echo " NOTA: Los backups se guardan automáticamente cada hora en ./backups/"
echo "       Conectá un USB y monta en /var/kamelia/backups para mayor seguridad."
echo ""
