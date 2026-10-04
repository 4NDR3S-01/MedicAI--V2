-- Historial de cambios de permisos del Círculo. Idempotente.
CREATE TABLE IF NOT EXISTS "CircleAuditEvent" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "actorId" TEXT,
    "subjectId" TEXT,
    "linkId" TEXT,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CircleAuditEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CircleAuditEvent_ownerId_createdAt_idx" ON "CircleAuditEvent"("ownerId", "createdAt");
CREATE INDEX IF NOT EXISTS "CircleAuditEvent_subjectId_createdAt_idx" ON "CircleAuditEvent"("subjectId", "createdAt");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CircleAuditEvent_ownerId_fkey') THEN
    ALTER TABLE "CircleAuditEvent" ADD CONSTRAINT "CircleAuditEvent_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CircleAuditEvent_actorId_fkey') THEN
    ALTER TABLE "CircleAuditEvent" ADD CONSTRAINT "CircleAuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CircleAuditEvent_subjectId_fkey') THEN
    ALTER TABLE "CircleAuditEvent" ADD CONSTRAINT "CircleAuditEvent_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
