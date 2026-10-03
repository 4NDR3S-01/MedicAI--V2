-- Círculo para profesionales y familias grandes: grupos privados para
-- organizar personas y registro de quién agregó/cambió/registró cada cosa.
-- Idempotente.

-- Auditoría
ALTER TABLE "Medication" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
ALTER TABLE "Medication" ADD COLUMN IF NOT EXISTS "updatedById" TEXT;
ALTER TABLE "MedicationLog" ADD COLUMN IF NOT EXISTS "loggedById" TEXT;
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "updatedById" TEXT;

-- Invitaciones: grupos de quien invita
ALTER TABLE "CircleInvitation" ADD COLUMN IF NOT EXISTS "inviterGroupIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Grupos
CREATE TABLE IF NOT EXISTS "CircleGroup" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'account-group',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CircleGroup_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "CircleGroupMember" (
    "groupId" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    CONSTRAINT "CircleGroupMember_pkey" PRIMARY KEY ("groupId", "linkId")
);
CREATE INDEX IF NOT EXISTS "CircleGroup_ownerId_idx" ON "CircleGroup"("ownerId");
CREATE INDEX IF NOT EXISTS "CircleGroupMember_linkId_idx" ON "CircleGroupMember"("linkId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Medication_createdById_fkey') THEN
    ALTER TABLE "Medication" ADD CONSTRAINT "Medication_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Medication_updatedById_fkey') THEN
    ALTER TABLE "Medication" ADD CONSTRAINT "Medication_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MedicationLog_loggedById_fkey') THEN
    ALTER TABLE "MedicationLog" ADD CONSTRAINT "MedicationLog_loggedById_fkey" FOREIGN KEY ("loggedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Appointment_createdById_fkey') THEN
    ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Appointment_updatedById_fkey') THEN
    ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CircleGroup_ownerId_fkey') THEN
    ALTER TABLE "CircleGroup" ADD CONSTRAINT "CircleGroup_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CircleGroupMember_groupId_fkey') THEN
    ALTER TABLE "CircleGroupMember" ADD CONSTRAINT "CircleGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CircleGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CircleGroupMember_linkId_fkey') THEN
    ALTER TABLE "CircleGroupMember" ADD CONSTRAINT "CircleGroupMember_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "CircleLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
