-- Horarios flexibles (días de la semana, cada N días, según necesidad),
-- dosis que cambia con el tiempo y control de existencias. Idempotente.
ALTER TABLE "Medication" ADD COLUMN IF NOT EXISTS "scheduleType" TEXT NOT NULL DEFAULT 'DAILY';
ALTER TABLE "Medication" ADD COLUMN IF NOT EXISTS "weekDays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
ALTER TABLE "Medication" ADD COLUMN IF NOT EXISTS "dayInterval" INTEGER;
ALTER TABLE "Medication" ADD COLUMN IF NOT EXISTS "startDate" TEXT;
ALTER TABLE "Medication" ADD COLUMN IF NOT EXISTS "dosageSteps" JSONB;
ALTER TABLE "Medication" ADD COLUMN IF NOT EXISTS "maxDailyDoses" INTEGER;
ALTER TABLE "Medication" ADD COLUMN IF NOT EXISTS "minHoursBetween" INTEGER;
ALTER TABLE "Medication" ADD COLUMN IF NOT EXISTS "stockQuantity" DOUBLE PRECISION;
ALTER TABLE "Medication" ADD COLUMN IF NOT EXISTS "stockPerDose" DOUBLE PRECISION;
ALTER TABLE "Medication" ADD COLUMN IF NOT EXISTS "stockAlertAt" DOUBLE PRECISION;
ALTER TABLE "MedicationLog" ADD COLUMN IF NOT EXISTS "stockUnits" DOUBLE PRECISION;
