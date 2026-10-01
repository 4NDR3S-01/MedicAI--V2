import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { BIRTH_DATE_PATTERN } from '../../../common/birth-date';

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
  @IsEmail({}, { message: 'Ingresa un correo electrónico válido.' })
  email!: string;

  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  @MaxLength(72, { message: 'La contraseña no puede superar los 72 caracteres.' })
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  fullName?: string;

  // La edad mínima se valida en AuthService (depende de la fecha actual).
  @IsOptional()
  @IsString()
  @Matches(BIRTH_DATE_PATTERN, { message: 'La fecha de nacimiento debe tener el formato AAAA-MM-DD.' })
  birthDate?: string;

  // E.164 (+593987654321). Se acepta sin "+" por compatibilidad con versiones
  // anteriores de la app, que enviaban solo el número nacional.
  @IsOptional()
  @IsString()
  @Matches(/^\+?\d{6,15}$/, { message: 'El número de teléfono no es válido.' })
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
  @IsBoolean()
  aiHealthContextConsent?: boolean;

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
