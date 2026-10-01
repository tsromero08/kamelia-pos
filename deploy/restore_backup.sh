#!/bin/bash
# Restaurar el último backup en caso de emergencia.
# Uso:  ./restore_backup.sh                  (último backup)
#       ./restore_backup.sh archivo.sql.gz   (backup específico)
set -e

PROJECT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
BACKUP_DIR="${PROJECT_DIR}/backups"

FILE=$1
if [ -z "$FILE" ]; then
    FILE=$(ls -1t "$BACKUP_DIR"/kamelia_*.sql.gz 2>/dev/null | head -1)
fi

if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
    echo "ERROR: no se encontró backup. Buscado en: $BACKUP_DIR"
    exit 1
fi

echo "Restaurando: $FILE"
read -p "¿SEGURO? Esto SOBRESCRIBE la BD actual. Escribe SI: " confirm
[ "$confirm" = "SI" ] || exit 1

source "${PROJECT_DIR}/.env"
gunzip -c "$FILE" | docker exec -i ${COMPOSE_PROJECT_NAME:-kamelia}_db \
    psql -U ${POSTGRES_USER:-kamelia_user} -d ${POSTGRES_DB:-kamelia_pos}

echo "✓ Restaurado"
