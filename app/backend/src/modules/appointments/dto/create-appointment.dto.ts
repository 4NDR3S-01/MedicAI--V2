import { Type } from 'class-transformer';
import { IsDate, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

import { RepeatDto } from './repeat.dto';

export const APPOINTMENT_ATTENDANCE_STATUSES = ['PENDING', 'ATTENDED', 'MISSED'] as const;
export type AppointmentAttendanceStatus = typeof APPOINTMENT_ATTENDANCE_STATUSES[number];

export class CreateAppointmentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  doctorName!: string;

  @Type(() => Date)
  @IsDate()
  scheduledAt!: Date;

  @IsString()
  @IsOptional()
  @MaxLength(160)
  location?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;

  /** Crear una serie de citas que se repiten. */
  @IsOptional()
  @ValidateNested()
  @Type(() => RepeatDto)
  repeat?: RepeatDto;
}
