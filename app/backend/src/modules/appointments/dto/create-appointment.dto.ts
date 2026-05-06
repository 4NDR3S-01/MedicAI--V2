import { Type } from 'class-transformer';
import { IsDate, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

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
}
