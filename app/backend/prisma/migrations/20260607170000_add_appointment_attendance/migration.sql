ALTER TABLE "Appointment"
ADD COLUMN "attendanceStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN "attendanceMarkedAt" TIMESTAMP(3);

CREATE INDEX "Appointment_attendanceStatus_idx" ON "Appointment"("attendanceStatus");
