import { Transform } from 'class-transformer';
import { IsIn, IsISO8601, IsOptional } from 'class-validator';

export const MEDICATION_LOG_ACTIONS = ['TAKEN', 'SKIPPED', 'SNOOZED'] as const;

export class LogMedicationActionDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsIn(MEDICATION_LOG_ACTIONS)
  action!: (typeof MEDICATION_LOG_ACTIONS)[number];

  @IsISO8601()
  @IsOptional()
  scheduledFor?: string;
}
