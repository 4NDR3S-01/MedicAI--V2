import { IsBoolean, IsOptional } from 'class-validator';

/** Permisos enviados por el cliente. Los ausentes cuentan como `false`. */
export class PermissionsDto {
  @IsOptional() @IsBoolean() viewMedications?: boolean;
  @IsOptional() @IsBoolean() addMedications?: boolean;
  @IsOptional() @IsBoolean() editMedications?: boolean;
  @IsOptional() @IsBoolean() deleteMedications?: boolean;
  @IsOptional() @IsBoolean() manageReminders?: boolean;
  @IsOptional() @IsBoolean() logDoses?: boolean;
  @IsOptional() @IsBoolean() viewAppointments?: boolean;
  @IsOptional() @IsBoolean() manageAppointments?: boolean;
  @IsOptional() @IsBoolean() viewHealth?: boolean;
  @IsOptional() @IsBoolean() manageCircle?: boolean;
}
