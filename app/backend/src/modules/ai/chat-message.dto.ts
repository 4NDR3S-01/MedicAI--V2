import { ArrayMaxSize, IsArray, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ChatMessageDto {
  // Solo turnos de la conversación: el contexto de sistema lo pone el servidor.
  @IsOptional()
  @IsIn(['user', 'assistant'])
  role?: 'user' | 'assistant';

  @IsString()
  @MaxLength(4000)
  content!: string;
}

export class ChatRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  @ArrayMaxSize(12)
  @IsOptional()
  history?: ChatMessageDto[];

  /** 'voice': la respuesta se leerá en voz alta (más corta, sin listas). */
  @IsOptional()
  @IsIn(['text', 'voice'])
  mode?: 'text' | 'voice';

  /** Fotos del mensaje actual (caja de un medicamento, receta…), como data URL JPEG/PNG. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @IsString({ each: true })
  @MaxLength(3_000_000, { each: true })
  @Matches(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, { each: true, message: 'Imagen no válida.' })
  images?: string[];
}
