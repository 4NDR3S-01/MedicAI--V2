-- Zona horaria de cada persona: las horas de sus tomas se interpretan en ella
-- (un cuidador en otro país ve y recibe las alarmas a la hora correcta).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "timezone" TEXT;
