import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

class SpecialConditionsDto {
  @IsBoolean()
  pregnancy!: boolean;

  @IsBoolean()
  lactation!: boolean;

  @IsBoolean()
  recentSurgeries!: boolean;

  @IsBoolean()
  immunosuppression!: boolean;

  @IsBoolean()
  anticoagulantTreatment!: boolean;
}

class MedicationDraftDto {
  @IsString()
  id!: string;

  @IsString()
  name!: string;

  @IsString()
  dose!: string;

  @IsString()
  schedule!: string;

  @IsString()
  frequency!: string;
}

class AppointmentDraftDto {
  @IsString()
  id!: string;

  @IsString()
  specialty!: string;

  @IsString()
  date!: string;

  @IsString()
  time!: string;

  @IsString()
  place!: string;
}

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  fullName?: string;

  @IsOptional()
  @IsString()
  birthDate?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  conditions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  allergies?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SpecialConditionsDto)
  specialConditions?: SpecialConditionsDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MedicationDraftDto)
  medications?: MedicationDraftDto[];

  @IsOptional()
  @IsBoolean()
  medicationsDeferred?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AppointmentDraftDto)
  appointments?: AppointmentDraftDto[];

  @IsOptional()
  @IsBoolean()
  appointmentsDeferred?: boolean;
}
