import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  /** Para identificar el dispositivo en "Sesiones abiertas" (p. ej. "Pixel 7"). */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  deviceName?: string;

  @IsOptional()
  @IsIn(['android', 'ios', 'web'])
  platform?: string;
}
