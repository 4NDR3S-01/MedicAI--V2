import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength, IsInt, Min, IsISO8601 } from 'class-validator';

export class CreateMedicationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  dosage!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  frequency!: string;

  @IsString({ each: true })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { each: true })
  times?: string[];

  @IsString()
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  firstDoseTime?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  customIntervalHours?: number | null;

  @IsISO8601()
  @IsOptional()
  customEndDate?: string | null;
}
