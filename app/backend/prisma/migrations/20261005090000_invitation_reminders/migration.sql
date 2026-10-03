-- Elegir "sus recordatorios en tu teléfono" al invitar. Idempotente.
ALTER TABLE "CircleInvitation" ADD COLUMN IF NOT EXISTS "inviterReminderMode" TEXT NOT NULL DEFAULT 'OFF';
