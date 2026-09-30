-- Índices compuestos para consultar los logs de un usuario por rango de fecha
-- (GET /medications/logs?since=). Sustituyen a los índices de una sola columna,
-- que ninguna consulta usaba de forma aislada y penalizaban cada INSERT.
CREATE INDEX IF NOT EXISTS "MedicationLog_medicationId_takenAt_idx" ON "MedicationLog"("medicationId", "takenAt");
CREATE INDEX IF NOT EXISTS "MedicationLog_medicationId_scheduledFor_idx" ON "MedicationLog"("medicationId", "scheduledFor");

DROP INDEX IF EXISTS "MedicationLog_medicationId_idx";
DROP INDEX IF EXISTS "MedicationLog_takenAt_idx";
DROP INDEX IF EXISTS "MedicationLog_scheduledFor_idx";
