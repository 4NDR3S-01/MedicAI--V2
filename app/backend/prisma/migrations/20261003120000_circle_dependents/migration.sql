-- Círculo: perfiles a cargo (personas sin cuenta propia), recordatorios para
-- cuidadores y quién creó cada invitación. Idempotente.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isManaged" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "managedById" TEXT;

ALTER TABLE "CircleGrant" ADD COLUMN IF NOT EXISTS "reminderMode" TEXT NOT NULL DEFAULT 'OFF';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CircleInvitation_createdById_fkey') THEN
    -- Invitaciones creadas por cuentas que ya no existen: no se pueden enlazar.
    DELETE FROM "CircleInvitation" i WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE u."id" = i."createdById");
    ALTER TABLE "CircleInvitation" ADD CONSTRAINT "CircleInvitation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
