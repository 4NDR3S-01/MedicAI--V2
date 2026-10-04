import { ArrayMaxSize, IsArray, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
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
  @ArrayMaxSize(20)
  @IsOptional()
  history?: ChatMessageDto[];

  /** 'voice': la respuesta se leerá en voz alta (más corta, sin listas). */
  @IsOptional()
  @IsIn(['text', 'voice'])
  mode?: 'text' | 'voice';
}
