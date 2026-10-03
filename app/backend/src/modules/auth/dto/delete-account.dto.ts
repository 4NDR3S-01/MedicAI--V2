import { IsString, MaxLength, MinLength } from 'class-validator';

export class DeleteAccountDto {
  /** Se pide la contraseña para confirmar una acción irreversible. */
  @IsString()
  @MinLength(1, { message: 'Escribe tu contraseña.' })
  @MaxLength(72)
  password!: string;
}
