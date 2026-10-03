import { IsString, Matches, MaxLength } from 'class-validator';

export class UpdateTimezoneDto {
  /** Zona IANA, p. ej. "America/Bogota". Se valida además con Intl. */
  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$|^UTC$/, { message: 'Zona horaria no válida.' })
  timezone!: string;
}
