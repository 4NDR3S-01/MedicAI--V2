import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** Audio en base64 dentro de JSON (más fiable desde React Native que multipart). */
export class TranscribeDto {
  @IsOptional()
  @IsString()
  // ~45 s de voz comprimida ocupan unos 250 KB en base64; el límite deja margen.
  @MaxLength(3_000_000)
  @Matches(/^[A-Za-z0-9+/=]+$/, { message: 'Audio no válido.' })
  audio?: string;

  @IsOptional()
  @IsIn(['m4a', 'mp4', '3gp', 'aac', 'webm', 'wav', 'mp3', 'ogg'])
  format?: string;
}
