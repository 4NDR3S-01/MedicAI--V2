import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class RegisterPushTokenDto {
  /** Token de Expo: ExponentPushToken[xxxxxxxx]. */
  @IsString()
  @MaxLength(200)
  @Matches(/^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/, { message: 'Token de notificaciones no válido.' })
  token!: string;

  @IsOptional()
  @IsIn(['android', 'ios', 'web'])
  platform?: string;
}
