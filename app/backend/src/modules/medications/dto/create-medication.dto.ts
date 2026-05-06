import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

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

  @IsString()
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  firstDoseTime?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;
}
