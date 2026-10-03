import { IsISO8601, IsOptional, IsString } from 'class-validator';

export class MedicationLogsQueryDto {
  @IsISO8601()
  since!: string;

  /** Logs de otra persona del Círculo (requiere permiso para ver sus medicamentos). */
  @IsOptional()
  @IsString()
  ownerId?: string;
}
