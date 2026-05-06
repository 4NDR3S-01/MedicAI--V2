import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ChatMessageDto {
  @IsOptional()
  @IsIn(['system', 'user', 'assistant'])
  role?: 'system' | 'user' | 'assistant';

  @IsString()
  @MaxLength(4000)
  content!: string;
}

export class ChatRequestDto {
  @IsString()
  @MaxLength(4000)
  message!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  @ArrayMaxSize(12)
  @IsOptional()
  history?: ChatMessageDto[];
}
