import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateProfileDto {
  @IsString()
  @IsOptional()
  @MaxLength(120)
  fullName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(32)
  birthDate?: string;

  @IsString()
  @IsOptional()
  @MaxLength(32)
  phone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  conditions?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  allergies?: string;

  @IsBoolean()
  @IsOptional()
  pregnancy?: boolean;

  @IsBoolean()
  @IsOptional()
  lactation?: boolean;

  @IsBoolean()
  @IsOptional()
  recentSurgeries?: boolean;

  @IsBoolean()
  @IsOptional()
  immunosuppression?: boolean;

  @IsBoolean()
  @IsOptional()
  anticoagulantTreatment?: boolean;

  @IsInt()
  @IsOptional()
  @Min(0)
  @Max(120)
  notificationLeadMinutes?: number;
}
