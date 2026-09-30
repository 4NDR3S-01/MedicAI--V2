import { IsISO8601 } from 'class-validator';

export class MedicationLogsQueryDto {
  @IsISO8601()
  since!: string;
}
