-- Momento de la última activación de cada medicamento: las tomas anteriores no
-- cuentan como pendientes ni olvidadas. Idempotente (se puede ejecutar 2 veces).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Medication' AND column_name = 'activeSince'
  ) THEN
    ALTER TABLE "Medication" ADD COLUMN "activeSince" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
    -- Para los existentes, la última modificación es la mejor aproximación de
    -- la última activación (p. ej. un medicamento reactivado hoy).
    UPDATE "Medication" SET "activeSince" = "updatedAt";
  END IF;
END $$;
