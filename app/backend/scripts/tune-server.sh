#!/usr/bin/env bash
# tune-server.sh - Script de optimización inicial para servidor MedicAI
# Hardware objetivo: 2 GB RAM, Intel Celeron N2840, 16 GB eMMC.
# Ejecutar con privilegios de root o sudo.

set -euo pipefail

PG_VERSION="${PG_VERSION:-18}"
PG_CONF="/etc/postgresql/${PG_VERSION}/main/postgresql.conf"

log() {
  echo "[tune-server] $*"
}

# -----------------------------------------------------------------------------
# 1. Verificar PostgreSQL
# -----------------------------------------------------------------------------
if [[ ! -f "$PG_CONF" ]]; then
  log "No se encontró ${PG_CONF}. ¿Está instalada PostgreSQL ${PG_VERSION}?"
  log "Puedes indicar otra versión con: PG_VERSION=XX sudo ./tune-server.sh"
  exit 1
fi

# -----------------------------------------------------------------------------
# 2. Backup de configuración actual
# -----------------------------------------------------------------------------
BACKUP_FILE="${PG_CONF}.bak.$(date +%Y%m%d%H%M%S)"
cp "$PG_CONF" "$BACKUP_FILE"
log "Backup creado en: ${BACKUP_FILE}"

# -----------------------------------------------------------------------------
# 3. Aplicar configuración tuneada
# -----------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp "${SCRIPT_DIR}/postgresql-low-ram.conf" "$PG_CONF"
log "Configuración de PostgreSQL aplicada."

# -----------------------------------------------------------------------------
# 4. Desactivar servicios innecesarios en un servidor headless
# -----------------------------------------------------------------------------
log "Desactivando servicios innecesarios..."
services=(
  bluetooth
  cups
  cups-browsed
  avahi-daemon
  ModemManager
)

for svc in "${services[@]}"; do
  if systemctl is-active --quiet "$svc" 2>/dev/null || systemctl is-enabled --quiet "$svc" 2>/dev/null; then
    systemctl disable --now "$svc" 2>/dev/null || true
    log "  - ${svc} desactivado."
  else
    log "  - ${svc} no estaba activo."
  fi
done

# -----------------------------------------------------------------------------
# 5. Configurar zram (swap comprimida en RAM)
# -----------------------------------------------------------------------------
if command -v zramctl &>/dev/null && ! swapon --show=NAME,TYPE | grep -q zram; then
  log "Configurando zram..."
  modprobe zram num_devices=1 || true
  echo zstd > /sys/block/zram0/comp_algorithm 2>/dev/null || true
  # 25% de la RAM física como zram (~512 MB en 2 GB)
  echo "$(( $(awk '/MemTotal/ {print $2}' /proc/meminfo) / 4 ))K" > /sys/block/zram0/disksize 2>/dev/null || true
  mkswap /dev/zram0 &>/dev/null || true
  swapon /dev/zram0 -p 10 || true
  log "zram activado en /dev/zram0."
else
  log "zram ya estaba configurado o no está disponible."
fi

# -----------------------------------------------------------------------------
# 6. Limitar journald
# -----------------------------------------------------------------------------
log "Limitando journald..."
mkdir -p /etc/systemd/journald.conf.d
cat > /etc/systemd/journald.conf.d/99-low-ram.conf <<'EOF'
[Journal]
SystemMaxUse=100M
MaxFileSec=3day
EOF
systemctl restart systemd-journald || true

# -----------------------------------------------------------------------------
# 7. Montar con noatime si no lo está
# -----------------------------------------------------------------------------
if ! mount | grep 'on / ' | grep -q noatime; then
  log "Aplicando noatime al filesystem raíz..."
  mount -o remount,noatime /
  log "noatime aplicado. Considera añadir 'noatime' en /etc/fstab."
fi

# -----------------------------------------------------------------------------
# 8. Reiniciar PostgreSQL
# -----------------------------------------------------------------------------
# En algunas instalaciones de Debian, systemctl restart postgresql@X-main falla
# al leer el archivo PID aunque PostgreSQL arranque correctamente. Usamos
# pg_ctlcluster que es la herramienta nativa de Debian/Ubuntu.
log "Reiniciando PostgreSQL..."
if command -v pg_ctlcluster &>/dev/null; then
  pg_ctlcluster "${PG_VERSION}" main restart || {
    log "pg_ctlcluster falló, intentando systemctl..."
    systemctl restart "postgresql@${PG_VERSION}-main" || systemctl restart postgresql || true
  }
else
  systemctl restart "postgresql@${PG_VERSION}-main" || systemctl restart postgresql || true
fi

# -----------------------------------------------------------------------------
# 9. Resumen
# -----------------------------------------------------------------------------
log "Optimización aplicada. Verifica con:"
log "  free -h"
log "  swapon --show"
log "  systemctl status postgresql"
log "  pm2 status"
