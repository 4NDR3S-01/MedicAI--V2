-- Citas que se repiten (serie de citas). Idempotente.
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "seriesId" TEXT;
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "repeatRule" JSONB;
CREATE INDEX IF NOT EXISTS "Appointment_seriesId_scheduledAt_idx" ON "Appointment"("seriesId", "scheduledAt");
