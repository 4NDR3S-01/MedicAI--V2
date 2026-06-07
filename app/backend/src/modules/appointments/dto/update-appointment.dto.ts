import { Type } from 'class-transformer';
import { IsBoolean, IsDate, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { APPOINTMENT_ATTENDANCE_STATUSES, type AppointmentAttendanceStatus } from './create-appointment.dto';

export class UpdateAppointmentDto {
  @IsString()
  @IsOptional()
  @MaxLength(120)
  title?: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  doctorName?: string;

  @Type(() => Date)
  @IsDate()
  @IsOptional()
  scheduledAt?: Date;

  @IsString()
  @IsOptional()
  @MaxLength(160)
  location?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;

  @IsBoolean()
  @IsOptional()
  active?: boolean;

  @IsIn(APPOINTMENT_ATTENDANCE_STATUSES)
  @IsOptional()
  attendanceStatus?: AppointmentAttendanceStatus;
}
