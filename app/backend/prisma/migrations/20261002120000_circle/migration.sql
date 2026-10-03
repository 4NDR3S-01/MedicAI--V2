-- Círculo: vínculos entre personas, permisos por dirección e invitaciones.
-- Idempotente (se puede ejecutar 2 veces), como el resto de migraciones.

CREATE TABLE IF NOT EXISTS "CircleLink" (
    "id" TEXT NOT NULL,
    "userAId" TEXT NOT NULL,
    "userBId" TEXT NOT NULL,
    "relationA" TEXT NOT NULL,
    "relationALabel" TEXT,
    "relationB" TEXT NOT NULL,
    "relationBLabel" TEXT,
    "aCaresForB" BOOLEAN NOT NULL DEFAULT false,
    "bCaresForA" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "invitationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CircleLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CircleGrant" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "granteeId" TEXT NOT NULL,
    "viewMedications" BOOLEAN NOT NULL DEFAULT false,
    "addMedications" BOOLEAN NOT NULL DEFAULT false,
    "editMedications" BOOLEAN NOT NULL DEFAULT false,
    "deleteMedications" BOOLEAN NOT NULL DEFAULT false,
    "manageReminders" BOOLEAN NOT NULL DEFAULT false,
    "logDoses" BOOLEAN NOT NULL DEFAULT false,
    "viewAppointments" BOOLEAN NOT NULL DEFAULT false,
    "manageAppointments" BOOLEAN NOT NULL DEFAULT false,
    "viewHealth" BOOLEAN NOT NULL DEFAULT false,
    "manageCircle" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CircleGrant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CircleInvitation" (
    "id" TEXT NOT NULL,
    "inviterId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "inviteeEmail" TEXT,
    "inviteeUserId" TEXT,
    "inviteeName" TEXT,
    "code" TEXT NOT NULL,
    "inviterRelation" TEXT NOT NULL,
    "inviterRelationLabel" TEXT,
    "inviterCaresForInvitee" BOOLEAN NOT NULL DEFAULT false,
    "inviteeCaresForInviter" BOOLEAN NOT NULL DEFAULT false,
    "grantedPermissions" JSONB NOT NULL,
    "requestedPermissions" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "respondedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CircleInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CircleLink_invitationId_key" ON "CircleLink"("invitationId");
CREATE INDEX IF NOT EXISTS "CircleLink_userAId_status_idx" ON "CircleLink"("userAId", "status");
CREATE INDEX IF NOT EXISTS "CircleLink_userBId_status_idx" ON "CircleLink"("userBId", "status");
CREATE INDEX IF NOT EXISTS "CircleGrant_granteeId_ownerId_idx" ON "CircleGrant"("granteeId", "ownerId");
CREATE UNIQUE INDEX IF NOT EXISTS "CircleGrant_linkId_ownerId_key" ON "CircleGrant"("linkId", "ownerId");
CREATE UNIQUE INDEX IF NOT EXISTS "CircleInvitation_code_key" ON "CircleInvitation"("code");
CREATE INDEX IF NOT EXISTS "CircleInvitation_inviterId_status_idx" ON "CircleInvitation"("inviterId", "status");
CREATE INDEX IF NOT EXISTS "CircleInvitation_inviteeEmail_status_idx" ON "CircleInvitation"("inviteeEmail", "status");
CREATE INDEX IF NOT EXISTS "CircleInvitation_inviteeUserId_status_idx" ON "CircleInvitation"("inviteeUserId", "status");

-- Un solo vínculo ACTIVO por pareja de personas, sin importar quién invitó.
-- (Prisma no expresa índices parciales; el servicio también lo comprueba.)
CREATE UNIQUE INDEX IF NOT EXISTS "CircleLink_active_pair_key"
  ON "CircleLink"(LEAST("userAId", "userBId"), GREATEST("userAId", "userBId"))
  WHERE "status" = 'ACTIVE';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CircleLink_userAId_fkey') THEN
    ALTER TABLE "CircleLink" ADD CONSTRAINT "CircleLink_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CircleLink_userBId_fkey') THEN
    ALTER TABLE "CircleLink" ADD CONSTRAINT "CircleLink_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CircleGrant_linkId_fkey') THEN
    ALTER TABLE "CircleGrant" ADD CONSTRAINT "CircleGrant_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "CircleLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CircleGrant_ownerId_fkey') THEN
    ALTER TABLE "CircleGrant" ADD CONSTRAINT "CircleGrant_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CircleGrant_granteeId_fkey') THEN
    ALTER TABLE "CircleGrant" ADD CONSTRAINT "CircleGrant_granteeId_fkey" FOREIGN KEY ("granteeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CircleInvitation_inviterId_fkey') THEN
    ALTER TABLE "CircleInvitation" ADD CONSTRAINT "CircleInvitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
