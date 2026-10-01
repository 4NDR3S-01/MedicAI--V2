-- Consentimiento explícito para usar el perfil de salud como contexto de la IA.
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "aiHealthContextConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "aiHealthContextConsentAt" TIMESTAMP(3);
