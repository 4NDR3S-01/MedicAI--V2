#!/usr/bin/env bash
# tune-server.sh - Optimización conservadora para servidor MedicAI
# Hardware objetivo: 2 GB RAM, Intel Celeron N2840, eMMC.
# Ejecutar con privilegios de root o sudo.
#
# Uso:
#   sudo ./scripts/tune-server.sh
#   sudo ./scripts/tune-server.sh --dry-run   # solo muestra, no cambia

set -euo pipefail

PG_VERSION="${PG_VERSION:-18}"
PG_CONF="/etc/postgresql/${PG_VERSION}/main/postgresql.conf"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DRY_RUN=false

if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

log() {
  echo "[tune-server] $*"
}

# -----------------------------------------------------------------------------
# 1. Verificar PostgreSQL
# -----------------------------------------------------------------------------
if [[ ! -f "$PG_CONF" ]]; then
  log "ERROR: No se encontró ${PG_CONF}."
  log "  ¿Está instalada PostgreSQL ${PG_VERSION}?"
  log "  Puedes indicar otra versión con: PG_VERSION=XX sudo ./tune-server.sh"
  exit 1
fi

# -----------------------------------------------------------------------------
# 2. Backup de configuración actual
# -----------------------------------------------------------------------------
BACKUP_FILE="${PG_CONF}.bak.$(date +%Y%m%d%H%M%S)"
if [[ "$DRY_RUN" == "true" ]]; then
  log "[dry-run] Se crearía backup en: ${BACKUP_FILE}"
else
  cp "$PG_CONF" "$BACKUP_FILE"
  log "Backup creado en: ${BACKUP_FILE}"
fi

# -----------------------------------------------------------------------------
# 3. Aplicar configuración tuneada
# -----------------------------------------------------------------------------
if [[ "$DRY_RUN" == "true" ]]; then
  log "[dry-run] Se copiaría:"
  log "  ${SCRIPT_DIR}/postgresql-low-ram.conf -> ${PG_CONF}"
  log "[dry-run] Diferencias principales contra tu config actual:"
  diff -u "$PG_CONF" "${SCRIPT_DIR}/postgresql-low-ram.conf" || true
else
  cp "${SCRIPT_DIR}/postgresql-low-ram.conf" "$PG_CONF"
  log "Configuración de PostgreSQL aplicada."
fi

# -----------------------------------------------------------------------------
# 4. Reiniciar PostgreSQL con verificación y rollback automático
# -----------------------------------------------------------------------------
restart_postgresql() {
  log "Reiniciando PostgreSQL..."
  if command -v pg_ctlcluster &>/dev/null; then
    pg_ctlcluster "${PG_VERSION}" main restart
  else
    systemctl restart "postgresql@${PG_VERSION}-main" || systemctl restart postgresql
  fi
}

rollback_config() {
  log "ERROR: PostgreSQL no arrancó con la nueva configuración."
  log "Restaurando configuración anterior desde backup..."
  cp "$BACKUP_FILE" "$PG_CONF"
  if command -v pg_ctlcluster &>/dev/null; then
    pg_ctlcluster "${PG_VERSION}" main start || true
  else
    systemctl start "postgresql@${PG_VERSION}-main" || systemctl start postgresql || true
  fi
  log "Rollback completado. Configuración original restaurada."
  exit 1
}

if [[ "$DRY_RUN" == "false" ]]; then
  if restart_postgresql; then
    sleep 1
    if pg_ctlcluster "${PG_VERSION}" main status &>/dev/null || systemctl is-active --quiet postgresql; then
      log "PostgreSQL reiniciado correctamente."
    else
      rollback_config
    fi
  else
    rollback_config
  fi
else
  log "[dry-run] No se reinicia PostgreSQL."
fi

# -----------------------------------------------------------------------------
# 5. Resumen
# -----------------------------------------------------------------------------
if [[ "$DRY_RUN" == "true" ]]; then
  log "[dry-run] Finalizado. No se realizaron cambios."
else
  log "Optimización aplicada. Verifica con:"
  log "  sudo systemctl status postgresql"
  log "  sudo -u postgres psql -c \"SHOW shared_buffers;\""
  log "  sudo -u postgres psql -c \"SHOW max_connections;\""
fi
