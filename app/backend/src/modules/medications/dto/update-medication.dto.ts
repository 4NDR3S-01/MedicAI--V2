import { IsBoolean, IsOptional, IsString, Matches, MaxLength, IsInt, Min, IsISO8601 } from 'class-validator';

export class UpdateMedicationDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  dosage?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  frequency?: string;

  @IsString({ each: true })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { each: true })
  times?: string[];

  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;

  @IsBoolean()
  @IsOptional()
  active?: boolean;

  @IsInt()
  @IsOptional()
  @Min(1)
  customIntervalHours?: number;

  @IsISO8601()
  @IsOptional()
  customEndDate?: string;
}
